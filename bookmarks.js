// ============================================
// ЗАКЛАДКИ
// ============================================

(function() {
    'use strict';

    const VISITOR_ID_KEY = 'almanion_visitor_id';
    const LOCAL_BOOKMARKS_KEY = 'almanion_bookmarks';
    let db = null;
    let auth = null;
    let bookmarkRef = null;
    let bookmarkOwnerUid = null;
    let bookmarkCacheKey = LOCAL_BOOKMARKS_KEY + '_guest';
    let visitorId = null;
    let bookmarks = {};
    let bookmarksPanelOpen = false;
    let bmDragging = false;
    let bmJustDragged = false; // подавляет «клик» по карточке сразу после перетаскивания
    let lastLocalWriteAt = 0;  // окно, в котором эхо Firebase не пересобирает панель
    let lazyObserver = null;

    // Безопасные обёртки для localStorage — приватный режим и quota
    const safeGet = (window.safeStorageGet) || function(k){ try { return localStorage.getItem(k); } catch(_) { return null; } };
    const safeSet = (window.safeStorageSet) || function(k,v){ try { localStorage.setItem(k,v); return true; } catch(_) { return false; } };

    function getVisitorId() {
        let id = safeGet(VISITOR_ID_KEY);
        if (!id) {
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            safeSet(VISITOR_ID_KEY, id);
        }
        return id;
    }

    function initFirebase() {
        if (typeof firebase === 'undefined') return false;
        if (typeof firebaseConfig === 'undefined' || !firebaseConfig || firebaseConfig.apiKey === "ВСТАВЬ_СВОЙ_API_KEY") return false;
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
        auth = typeof firebase.auth === 'function' ? firebase.auth() : null;
        return true;
    }

    function getBookmarksRef() {
        return bookmarkRef;
    }

    function loadBookmarks() {
        try {
            const guest = safeGet(bookmarkCacheKey);
            const legacy = safeGet(LOCAL_BOOKMARKS_KEY);
            bookmarks = JSON.parse(guest || legacy || '{}');
            if (!guest && legacy) safeSet(bookmarkCacheKey, legacy);
        } catch { bookmarks = {}; }

        if (auth) auth.onAuthStateChanged(connectBookmarksAccount);
    }

    function bookmarkUpdatedAt(entry) {
        return Number(entry && (entry.updatedAt || entry.timestamp)) || 0;
    }

    function mergeBookmarkStores(local, remote) {
        const merged = {};
        new Set(Object.keys(local || {}).concat(Object.keys(remote || {}))).forEach(id => {
            const a = local && local[id];
            const b = remote && remote[id];
            if (!a) merged[id] = b;
            else if (!b) merged[id] = a;
            else merged[id] = bookmarkUpdatedAt(b) >= bookmarkUpdatedAt(a) ? b : a;
        });
        return merged;
    }

    function connectBookmarksAccount(user) {
        safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
        if (bookmarkRef) {
            try { bookmarkRef.off(); } catch (_) {}
            bookmarkRef = null;
        }
        const previousOwnerUid = bookmarkOwnerUid;
        bookmarkOwnerUid = user && user.uid ? user.uid : null;
        bookmarkCacheKey = bookmarkOwnerUid
            ? LOCAL_BOOKMARKS_KEY + '_uid_' + bookmarkOwnerUid
            : LOCAL_BOOKMARKS_KEY + '_guest';

        let cachedForOwner = {};
        try { cachedForOwner = JSON.parse(safeGet(bookmarkCacheKey) || '{}'); } catch (_) {}
        if (bookmarkOwnerUid && !previousOwnerUid) {
            // Первые локальные закладки гостя переносим в вошедший аккаунт.
            bookmarks = mergeBookmarkStores(cachedForOwner, bookmarks);
        } else {
            bookmarks = cachedForOwner;
        }

        if (!db || !bookmarkOwnerUid) {
            refreshAllButtons();
            if (bookmarksPanelOpen) renderBookmarksPanel();
            return;
        }

        bookmarkRef = db.ref('bookmarks/' + bookmarkOwnerUid);
        const ref = bookmarkRef;
        ref.once('value').then(snap => {
            if (bookmarkRef !== ref) return null;
            bookmarks = mergeBookmarkStores(bookmarks, snap.val() || {});
            safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
            return ref.update(bookmarks);
        }).then(() => {
            if (bookmarkRef !== ref) return;
            ref.on('value', applyRemoteBookmarks, () => {});
            refreshAllButtons();
            if (bookmarksPanelOpen) renderBookmarksPanel();
        }).catch(() => {
            refreshAllButtons();
        });
    }

    function applyRemoteBookmarks(snap) {
        bookmarks = mergeBookmarkStores(bookmarks, snap.val() || {});
        safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
        refreshAllButtons();
        if (bookmarksPanelOpen && !bmDragging && (Date.now() - lastLocalWriteAt > 1200)) {
            renderBookmarksPanel();
        }
    }

    function hasBookmark(id) {
        return !!(bookmarks[id] && !bookmarks[id].deleted);
    }

    function saveBookmark(id, data) {
        bookmarks[id] = { ...data, deleted: false, updatedAt: Date.now() };
        lastLocalWriteAt = Date.now();
        const ref = getBookmarksRef();
        if (ref) {
            ref.child(id).set(bookmarks[id]).catch(() => {});
        }
        safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
    }

    function removeBookmark(id) {
        bookmarks[id] = {
            deleted: true,
            updatedAt: Date.now(),
            timestamp: bookmarkUpdatedAt(bookmarks[id])
        };
        lastLocalWriteAt = Date.now();
        const ref = getBookmarksRef();
        if (ref) {
            ref.child(id).set(bookmarks[id]).catch(() => {});
        }
        safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
    }

    function generateBookmarkId(box) {
        const topic = box.closest('.topic[id], .content-section[id]');
        const topicId = topic ? topic.id : 'unknown';
        const pageId = (location.pathname.split('/').pop() || 'index').replace(/\.html$/i, '');
        const boxes = topic ? Array.from(topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box, .properties-box, .experiment-box, .derivation-box, .system-box')) : [];
        const idx = boxes.indexOf(box);
        return pageId + '__' + topicId + '_' + idx;
    }

    function migrateLegacyBookmark(box, newId) {
        const topic = box.closest('.topic[id], .content-section[id]');
        if (!topic) return;
        const boxes = Array.from(topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box, .properties-box, .experiment-box, .derivation-box, .system-box'));
        const legacyId = topic.id + '_' + boxes.indexOf(box);
        const legacy = bookmarks[legacyId];
        if (!legacy || legacy.deleted || bookmarks[newId]) return;
        const samePage = !legacy.page || legacy.page === location.pathname || legacy.page.endsWith('/' + (location.pathname.split('/').pop() || ''));
        if (!samePage || (legacy.topicId && legacy.topicId !== topic.id)) return;
        saveBookmark(newId, { ...legacy, timestamp: legacy.timestamp || Date.now() });
        removeBookmark(legacyId);
    }

    function getBookmarkPreview(box) {
        const strong = box.querySelector('strong');
        if (strong) return strong.textContent.trim().substring(0, 80);
        const text = box.textContent.trim().replace(/\s+/g, ' ');
        return text.substring(0, 80);
    }

    function getBoxType(box) {
        if (box.classList.contains('definition-box')) return 'definition';
        if (box.classList.contains('formula-box')) return 'formula';
        if (box.classList.contains('theorem-box')) return 'theorem';
        if (box.classList.contains('remark-box')) return 'remark';
        if (box.classList.contains('lemma-box')) return 'lemma';
        if (box.classList.contains('example-box')) return 'example';
        if (box.classList.contains('statement-box')) return 'statement';
        if (box.classList.contains('corollary-box')) return 'corollary';
        if (box.classList.contains('properties-box')) return 'properties';
        if (box.classList.contains('experiment-box')) return 'experiment';
        if (box.classList.contains('derivation-box')) return 'derivation';
        if (box.classList.contains('system-box')) return 'system';
        return 'other';
    }

    function getTypeLabel(type) {
        const labels = {
            definition: 'Определение',
            formula: 'Формула',
            theorem: 'Теорема',
            remark: 'Замечание',
            lemma: 'Лемма',
            example: 'Пример',
            statement: 'Утверждение',
            corollary: 'Следствие',
            properties: 'Свойства',
            experiment: 'Опыт',
            derivation: 'Вывод',
            system: 'Система'
        };
        return labels[type] || 'Блок';
    }

    function getTypeColor(type) {
        const colors = {
            definition: '#3b82f6',
            formula: '#8b5cf6',
            theorem: '#f59e0b',
            remark: '#10b981',
            lemma: '#f97316',
            example: '#06b6d4',
            statement: '#ec4899',
            corollary: '#6366f1',
            properties: '#14b8a6',
            experiment: '#ef4444',
            derivation: '#a855f7',
            system: '#0ea5e9'
        };
        return colors[type] || '#6b7280';
    }

    function addBookmarkButtons(root = document) {
        const selector = '.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box, .properties-box, .experiment-box, .derivation-box, .system-box';
        root.querySelectorAll(selector).forEach(box => {
            if (box.querySelector('.bookmark-btn')) return;
            if (box.closest('.definition-box, .formula-box, .theorem-box, .remark-box, .properties-box, .experiment-box, .derivation-box, .system-box')) {
                if (box.parentElement.closest('.definition-box, .formula-box, .theorem-box, .remark-box, .properties-box, .experiment-box, .derivation-box, .system-box')) return;
            }

            const btn = document.createElement('button');
            btn.className = 'bookmark-btn';
            const bmId = generateBookmarkId(box);
            migrateLegacyBookmark(box, bmId);
            btn.dataset.bmId = bmId;
            btn.innerHTML = bookmarkSvg(hasBookmark(bmId));
            if (hasBookmark(bmId)) btn.classList.add('bookmarked');
            btn.setAttribute('aria-label', hasBookmark(bmId) ? 'Удалить из закладок' : 'Добавить в закладки');

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.bmId;
                if (hasBookmark(id)) {
                    removeBookmark(id);
                    btn.innerHTML = bookmarkSvg(false);
                    btn.classList.remove('bookmarked');
                    keepRemovedButtonVisuallyEmpty(btn);
                    btn.setAttribute('aria-label', 'Добавить в закладки');
                } else {
                    const topic = box.closest('.topic[id], .content-section[id]');
                    const topicTitle = topic ? (topic.querySelector('.topic-title')?.textContent.trim() || '') : '';
                    saveBookmark(id, {
                        page: location.pathname,
                        pageTitle: document.title,
                        topicId: topic ? topic.id : '',
                        topicTitle: topicTitle,
                        preview: getBookmarkPreview(box),
                        type: getBoxType(box),
                        timestamp: Date.now()
                    });
                    btn.innerHTML = bookmarkSvg(true);
                    btn.classList.remove('bookmark-just-removed');
                    btn.classList.add('bookmarked');
                    btn.setAttribute('aria-label', 'Удалить из закладок');
                    btn.style.transform = 'scale(1.3)';
                    setTimeout(() => btn.style.transform = '', 200);
                }
                if (bookmarksPanelOpen) renderBookmarksPanel();
            });

            box.style.position = 'relative';
            box.appendChild(btn);
        });
    }

    function initLazyBookmarkButtons() {
        const topics = Array.from(document.querySelectorAll('.main-content .topic[id]'));
        if (!topics.length || !('IntersectionObserver' in window)) {
            addBookmarkButtons();
            return;
        }

        const topicObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                topicObserver.unobserve(entry.target);
                addBookmarkButtons(entry.target);
            });
        }, { rootMargin: '700px 0px' });

        const hashTarget = window.location.hash
            ? document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.closest('.topic[id]')
            : null;
        const initial = hashTarget || topics[0];
        addBookmarkButtons(initial);
        topics.forEach(topic => {
            if (topic !== initial) topicObserver.observe(topic);
        });

        window.addEventListener('almanion:topic-visible', event => {
            const topic = event.detail?.topic;
            if (!topic) return;
            topicObserver.unobserve(topic);
            addBookmarkButtons(topic);
        });
    }

    function bookmarkSvg(filled) {
        // Закладка — лента/тег. filled = заполнена цветом, иначе только обводка.
        return '<svg class="bookmark-icon" viewBox="0 0 24 24" fill="' + (filled ? 'currentColor' : 'none')
             + '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
             + '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
    }

    function keepRemovedButtonVisuallyEmpty(btn) {
        if (!btn) return;
        btn.classList.add('bookmark-just-removed');

        // A clicked control may keep :hover on touch screens (and while the
        // mouse remains over it). Keep the icon empty until a genuinely new
        // interaction starts, then restore the normal hover preview.
        const clear = () => {
            btn.classList.remove('bookmark-just-removed');
            btn.removeEventListener('pointerenter', clear);
            btn.removeEventListener('blur', clear);
        };
        btn.addEventListener('pointerenter', clear);
        btn.addEventListener('blur', clear);
    }

    function refreshAllButtons() {
        document.querySelectorAll('.bookmark-btn').forEach(btn => {
            const id = btn.dataset.bmId;
            if (hasBookmark(id)) {
                btn.innerHTML = bookmarkSvg(true);
                btn.classList.remove('bookmark-just-removed');
                btn.classList.add('bookmarked');
                btn.setAttribute('aria-label', 'Удалить из закладок');
            } else {
                btn.innerHTML = bookmarkSvg(false);
                btn.classList.remove('bookmarked');
                btn.setAttribute('aria-label', 'Добавить в закладки');
            }
        });
    }

    function addBookmarksSidebarButton() {
        let container = document.querySelector('.sidebar-actions');
        if (!container) {
            const navMenu = document.querySelector('.nav-menu');
            if (!navMenu) return;
            container = navMenu;
        }

        const btn = document.createElement('button');
        btn.className = 'knowledge-check-btn';
        btn.id = 'bookmarksBtn';
        btn.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span>Закладки</span>';

        btn.addEventListener('click', () => {
            toggleBookmarksPanel();
        });

        container.appendChild(btn);
    }

    function toggleBookmarksPanel() {
        const existing = document.getElementById('bookmarksOverlay');
        if (existing && !existing.classList.contains('hidden')) {
            existing.classList.add('hidden');
            bookmarksPanelOpen = false;
            return;
        }
        bookmarksPanelOpen = true;
        renderBookmarksPanel();
    }

    function closeBookmarksPanel() {
        bmDragging = false;
        if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
        const overlay = document.getElementById('bookmarksOverlay');
        if (overlay) {
            overlay.classList.add('hidden');
            bookmarksPanelOpen = false;
        }
    }

    function initBookmarksSwipe() {
        const overlay = document.getElementById('bookmarksOverlay');
        if (!overlay || overlay.dataset.swipeInit) return;
        overlay.dataset.swipeInit = 'true';

        let startY = 0, currentY = 0, tracking = false, activated = false;
        const DEAD_ZONE = 15;

        function getModal() { return document.getElementById('bookmarksModal'); }

        overlay.addEventListener('touchstart', (e) => {
            if (bmDragging || window.innerWidth > 768) return;
            const modal = getModal();
            if (!modal || modal.scrollTop > 5) return;
            startY = e.touches[0].clientY;
            currentY = startY;
            tracking = true;
            activated = false;
        }, { passive: true });

        overlay.addEventListener('touchmove', (e) => {
            if (!tracking || bmDragging) { tracking = false; return; }
            const modal = getModal();
            if (!modal) return;
            currentY = e.touches[0].clientY;
            const deltaY = currentY - startY;
            if (!activated) {
                if (deltaY > DEAD_ZONE) {
                    activated = true;
                    startY = currentY;
                    modal.style.transition = 'none';
                }
                return;
            }
            const swipeDelta = currentY - startY;
            if (swipeDelta > 0) {
                e.preventDefault();
                modal.style.transform = `translateY(${swipeDelta}px)`;
                overlay.style.background = `rgba(0, 0, 0, ${Math.max(0, 0.75 - swipeDelta / 400)})`;
            }
        }, { passive: false });

        overlay.addEventListener('touchend', () => {
            if (!tracking) return;
            tracking = false;
            if (!activated) return;
            activated = false;
            const modal = getModal();
            if (!modal) return;
            const deltaY = currentY - startY;
            if (deltaY > 60) {
                modal.style.transition = 'transform 0.25s ease-out';
                modal.style.transform = 'translateY(100vh)';
                overlay.style.transition = 'background 0.25s ease-out';
                overlay.style.background = 'rgba(0, 0, 0, 0)';
                setTimeout(() => {
                    closeBookmarksPanel();
                    modal.style.transition = '';
                    modal.style.transform = '';
                    overlay.style.transition = '';
                    overlay.style.background = '';
                }, 250);
            } else {
                modal.style.transition = 'transform 0.25s ease-out';
                modal.style.transform = '';
                overlay.style.transition = 'background 0.25s ease-out';
                overlay.style.background = '';
                setTimeout(() => {
                    modal.style.transition = '';
                    overlay.style.transition = '';
                }, 250);
            }
        });
    }

    function findBoxById(bmId) {
        const scopedId = String(bmId || '').includes('__')
            ? String(bmId).slice(String(bmId).indexOf('__') + 2)
            : String(bmId || '');
        const parts = scopedId.split('_');
        const idx = parseInt(parts.pop());
        const topicId = parts.join('_');
        const topic = document.getElementById(topicId);
        if (!topic) return null;
        const boxes = topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box, .properties-box, .experiment-box, .derivation-box, .system-box');
        return boxes[idx] || null;
    }

    function sortedEntries() {
        return Object.entries(bookmarks)
            .filter(([, data]) => data && !data.deleted)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => {
                const oa = typeof a.order === 'number' ? a.order : Infinity;
                const ob = typeof b.order === 'number' ? b.order : Infinity;
                if (oa !== ob) return oa - ob;
                return (b.timestamp || 0) - (a.timestamp || 0);
            });
    }

    function persistOrder(orderedIds) {
        lastLocalWriteAt = Date.now();
        orderedIds.forEach((id, i) => {
            if (hasBookmark(id)) {
                bookmarks[id].order = i;
                bookmarks[id].updatedAt = Date.now();
            }
        });
        safeSet(bookmarkCacheKey, JSON.stringify(bookmarks));
        const ref = getBookmarksRef();
        if (ref) {
            const updates = {};
            orderedIds.forEach((id, i) => { updates[id + '/order'] = i; });
            ref.update(updates);
        }
    }

    function renderBookmarksPanel() {
        if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
        let overlay = document.getElementById('bookmarksOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'bookmarksOverlay';
            overlay.className = 'auth-overlay hidden';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) closeBookmarksPanel();
            });

            const modal = document.createElement('div');
            modal.id = 'bookmarksModal';
            modal.className = 'auth-modal';
            modal.style.cssText = 'max-width: 700px; max-height: 85vh; overflow-y: auto;';
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            initBookmarksSwipe();
        }

        const modal = document.getElementById('bookmarksModal');
        const currentPage = location.pathname;
        const entries = sortedEntries();

        modal.innerHTML = '';

        const header = document.createElement('h2');
        header.style.cssText = 'margin-top: 0; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;';
        header.innerHTML = '<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg><span>Закладки</span>';
        modal.appendChild(header);

        if (entries.length === 0) {
            const empty = document.createElement('p');
            empty.style.cssText = 'color: var(--text-secondary); text-align: center; padding: 2rem 0;';
            empty.innerHTML = 'Закладок пока нет.<br>Нажмите <span class="eic eic-bookmark" aria-hidden="true"></span> на любом блоке, чтобы добавить.';
            modal.appendChild(empty);
        } else {
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.6rem;';
            hint.textContent = 'Тяните за ручку слева, чтобы менять порядок · нажмите на карточку, чтобы раскрыть';
            modal.appendChild(hint);

            const list = document.createElement('div');
            list.className = 'bm-sortable-list';
            entries.forEach(bm => {
                const card = createBookmarkCard(bm, bm.page === currentPage);
                card.dataset.bmId = bm.id;
                list.appendChild(card);
            });
            modal.appendChild(list);
            initDragSort(list);
        }

        const closeWrap = document.createElement('div');
        closeWrap.style.cssText = 'text-align: center; margin-top: 1.5rem;';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'auth-submit';
        closeBtn.style.background = 'var(--text-secondary)';
        closeBtn.textContent = 'Закрыть';
        closeBtn.addEventListener('click', () => closeBookmarksPanel());
        closeWrap.appendChild(closeBtn);
        modal.appendChild(closeWrap);

        overlay.classList.remove('hidden');

        requestAnimationFrame(() => {
            ensureLazyObserver();
            if (lazyObserver) {
                modal.querySelectorAll('.bm-card-content[data-lazy-bm-id]').forEach(el => {
                    lazyObserver.observe(el);
                });
            } else {
                modal.querySelectorAll('.bm-card-content[data-lazy-bm-id]').forEach(el => {
                    const box = findBoxById(el.dataset.lazyBmId);
                    if (box) {
                        el.textContent = '';
                        el.appendChild(cloneBoxContent(box));
                        window.AlmanionMath?.render(el);
                    }
                    delete el.dataset.lazyBmId;
                    applyClampState(el);
                });
            }
        });
    }

    function initDragSort(list) {
        const modal = document.getElementById('bookmarksModal');
        let dragItem = null, placeholder = null, activePointer = null;
        let dragOffsetY = 0, initialTop = 0, lastPointerY = 0, savedColor = '';
        let rafId = null, modalTop = 0, modalBottom = 0;

        function reattachLazy() {
            if (!lazyObserver) return;
            const m = document.getElementById('bookmarksModal');
            if (!m) return;
            m.querySelectorAll('.bm-card-content[data-lazy-bm-id]').forEach(function (el) {
                lazyObserver.observe(el);
            });
        }

        function tick() {
            rafId = null;
            if (!dragItem) return;

            // --- ЧТЕНИЯ (без layout-trashing) ---
            const cards = list.querySelectorAll('.bm-card:not(.bm-dragging)');
            let beforeEl = null;
            for (const c of cards) {
                const r = c.getBoundingClientRect();
                if (lastPointerY < r.top + r.height / 2) { beforeEl = c; break; }
            }
            let scrollDelta = 0;
            if (modal) {
                const edge = 48, maxSpeed = 12;
                if (lastPointerY < modalTop + edge) {
                    scrollDelta = -maxSpeed * Math.min(1, (modalTop + edge - lastPointerY) / edge);
                } else if (lastPointerY > modalBottom - edge) {
                    scrollDelta = maxSpeed * Math.min(1, (lastPointerY - (modalBottom - edge)) / edge);
                }
            }

            // --- ЗАПИСИ ---
            dragItem.style.transform = 'translateY(' + (lastPointerY - dragOffsetY - initialTop) + 'px)';
            if (beforeEl) {
                if (placeholder.nextElementSibling !== beforeEl) list.insertBefore(placeholder, beforeEl);
            } else if (list.lastElementChild !== placeholder) {
                list.appendChild(placeholder);
            }
            if (scrollDelta && modal) {
                modal.scrollTop += scrollDelta;
                rafId = requestAnimationFrame(tick); // продолжаем автоскролл, пока палец у края
            }
        }

        function scheduleTick() { if (rafId == null) rafId = requestAnimationFrame(tick); }

        function startDrag(card, startY) {
            dragItem = card;
            bmDragging = true;
            savedColor = card.style.borderLeftColor || '';
            if (lazyObserver) lazyObserver.disconnect();

            const rect = card.getBoundingClientRect();
            initialTop = rect.top;
            dragOffsetY = startY - rect.top;
            lastPointerY = startY;
            if (modal) {
                const mr = modal.getBoundingClientRect();
                modalTop = mr.top;
                modalBottom = mr.bottom;
            }

            placeholder = document.createElement('div');
            placeholder.className = 'bm-drag-placeholder';
            placeholder.style.height = rect.height + 'px';
            card.parentNode.insertBefore(placeholder, card);

            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
            card.classList.add('bm-dragging');
            card.style.cssText =
                'position:fixed;z-index:99999;pointer-events:none;' +
                'left:' + rect.left + 'px;width:' + rect.width + 'px;top:' + initialTop + 'px;' +
                'margin:0;opacity:0.96;box-shadow:0 12px 34px rgba(0,0,0,0.28);' +
                'border-left-color:' + savedColor + ';will-change:transform;';
            if (navigator.vibrate) { try { navigator.vibrate(18); } catch (_) {} }
        }

        function endDrag() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            const card = dragItem;
            dragItem = null;
            activePointer = null;
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
            bmDragging = false;
            if (!card) return;

            card.classList.remove('bm-dragging');
            card.removeAttribute('style');
            if (savedColor) card.style.borderLeftColor = savedColor;
            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.insertBefore(card, placeholder);
                placeholder.remove();
            }
            placeholder = null;

            // подавляем клик-переход карточки, который иначе срабатывает после перетаскивания
            bmJustDragged = true;
            setTimeout(function () { bmJustDragged = false; }, 80);

            const ids = [].slice.call(list.querySelectorAll('.bm-card')).map(function (c) { return c.dataset.bmId; });
            persistOrder(ids);
            reattachLazy();
        }

        // Единый ввод (мышь + тач + перо) через Pointer Events.
        // Захват только за «ручку»; перетаскивание начинается после небольшого
        // смещения — без долгого нажатия и без конфликта с кликом/скроллом.
        list.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const handle = e.target.closest('.bm-drag-handle');
            if (!handle) return;
            const card = handle.closest('.bm-card');
            if (!card) return;
            e.preventDefault();

            const startY = e.clientY;
            activePointer = e.pointerId;
            let started = false;
            try { handle.setPointerCapture(e.pointerId); } catch (_) {}

            function onMove(ev) {
                if (ev.pointerId !== activePointer) return;
                if (!started) {
                    if (Math.abs(ev.clientY - startY) < 4) return; // порог: тап ≠ перетаскивание
                    started = true;
                    startDrag(card, startY);
                }
                lastPointerY = ev.clientY;
                scheduleTick();
            }
            function onUp(ev) {
                if (ev.pointerId !== activePointer) return;
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
                if (started) endDrag();
                else activePointer = null;
            }
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
        });
    }

    function cloneBoxContent(box) {
        const clone = box.cloneNode(true);
        // Убираем интерактив, который в карточке не нужен и может всплыть при наведении.
        clone.querySelectorAll('.bookmark-btn, .copy-block-btn').forEach(b => b.remove());
        clone.style.cssText = 'margin:0;border:none;box-shadow:none;border-radius:0;border-left:none;';
        return clone;
    }

    // Помечаем карточку «обрезанной», если содержимое не влезает в свёрнутую высоту —
    // только таким нужны затухание снизу, шеврон и жест «тап = раскрыть».
    function applyClampState(contentDiv) {
        const card = contentDiv.closest('.bm-card');
        if (!card) return;
        card.classList.toggle('bm-clamped', contentDiv.scrollHeight - contentDiv.clientHeight > 4);
    }

    function ensureLazyObserver() {
        if (lazyObserver) return;
        if (!('IntersectionObserver' in window)) return;
        lazyObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const contentDiv = entry.target;
                const bmId = contentDiv.dataset.lazyBmId;
                if (!bmId) return;
                lazyObserver.unobserve(contentDiv);
                const box = findBoxById(bmId);
                if (box) {
                    contentDiv.textContent = '';
                    contentDiv.appendChild(cloneBoxContent(box));
                    window.AlmanionMath?.render(contentDiv);
                }
                delete contentDiv.dataset.lazyBmId;
                applyClampState(contentDiv);
            });
        }, { root: document.getElementById('bookmarksModal'), rootMargin: '100px' });
    }

    function navigateToBookmark(bm, isCurrentPage) {
        if (isCurrentPage) {
            const box = findBoxById(bm.id);
            if (!box) return;
            // В постраничном экспериментальном режиме нужная тема может быть
            // display:none/inert. Сначала делаем её текущей, затем прокручиваем.
            if (window.experimentalReader && window.experimentalReader.isActive()) {
                window.experimentalReader.revealElement(box, {
                    source: 'bookmark',
                    animate: false,
                    scroll: false,
                    updateHash: true
                });
            }
            closeBookmarksPanel();
            if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
            setTimeout(() => {
                box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                box.classList.add('nav-highlight');
                setTimeout(() => box.classList.remove('nav-highlight'), 1500);
            }, 100);
        } else {
            try { sessionStorage.setItem('almanion_bookmark_target', bm.id); } catch (_) {}
            window.location.href = bm.page + '#' + bm.topicId;
        }
    }

    function restoreBookmarkTarget() {
        let bookmarkId = '';
        try { bookmarkId = sessionStorage.getItem('almanion_bookmark_target') || ''; } catch (_) {}
        if (!bookmarkId) return;
        const box = findBoxById(bookmarkId);
        if (!box) return;
        try { sessionStorage.removeItem('almanion_bookmark_target'); } catch (_) {}
        if (window.experimentalReader?.isActive?.()) {
            window.experimentalReader.revealElement(box, {
                source: 'bookmark', animate: false, scroll: false, updateHash: true
            });
        }
        setTimeout(() => {
            box.scrollIntoView({ behavior: 'auto', block: 'center' });
            box.classList.add('nav-highlight');
            setTimeout(() => box.classList.remove('nav-highlight'), 1500);
        }, 120);
    }

    function createBookmarkCard(bm, isCurrentPage) {
        const card = document.createElement('div');
        card.className = 'bm-card';
        card.dataset.bmId = bm.id;
        const color = getTypeColor(bm.type);
        card.style.borderLeftColor = color;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'bm-card-header';

        // Ручка перетаскивания — захват только за неё (drag); тело карточки раскрывает.
        const handle = document.createElement('span');
        handle.className = 'bm-drag-handle';
        handle.title = 'Перетащите, чтобы изменить порядок';
        handle.setAttribute('aria-hidden', 'true');
        handle.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
        handle.addEventListener('click', (e) => { e.stopPropagation(); });
        headerDiv.appendChild(handle);

        const typeSpan = document.createElement('span');
        typeSpan.className = 'bm-card-type';
        typeSpan.style.color = color;
        typeSpan.textContent = getTypeLabel(bm.type);
        headerDiv.appendChild(typeSpan);

        if (!isCurrentPage) {
            const pageSpan = document.createElement('span');
            pageSpan.className = 'bm-card-page';
            pageSpan.textContent = bm.topicTitle || bm.pageTitle || '';
            headerDiv.appendChild(pageSpan);
        }

        const chevron = document.createElement('span');
        chevron.className = 'bm-card-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
        headerDiv.appendChild(chevron);

        const delBtn = document.createElement('button');
        delBtn.className = 'bm-card-delete';
        delBtn.title = 'Удалить';
        delBtn.setAttribute('aria-label', 'Удалить закладку');
        delBtn.innerHTML = '<span class="eic eic-x" aria-hidden="true"></span>';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeBookmark(bm.id);
            refreshAllButtons();
            renderBookmarksPanel();
        });
        headerDiv.appendChild(delBtn);
        card.appendChild(headerDiv);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'bm-card-content';
        contentDiv.textContent = bm.preview || '';
        if (isCurrentPage) {
            contentDiv.dataset.lazyBmId = bm.id;
        }
        card.appendChild(contentDiv);

        // Подвал «Перейти к блоку»: у коротких карточек виден всегда, у обрезанных —
        // в раскрытом состоянии (видимостью управляет CSS).
        const foot = document.createElement('div');
        foot.className = 'bm-card-foot';
        const gotoBtn = document.createElement('button');
        gotoBtn.className = 'bm-card-goto';
        gotoBtn.innerHTML = 'Перейти к блоку <span aria-hidden="true">→</span>';
        gotoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigateToBookmark(bm, isCurrentPage);
        });
        foot.appendChild(gotoBtn);
        card.appendChild(foot);

        // Тап по карточке раскрывает/сворачивает (drag — только за ручку, поэтому
        // конфликта «клик после перетаскивания» нет; флаги — дополнительная страховка).
        card.addEventListener('click', (e) => {
            if (bmDragging || bmJustDragged) return;
            if (e.target.closest('.bm-drag-handle') ||
                e.target.closest('.bm-card-delete') ||
                e.target.closest('.bm-card-goto')) return;
            if (!card.classList.contains('bm-clamped')) return; // короткую нечего раскрывать
            // Раскрытую карточку не сворачиваем кликом по содержимому — там выделяют
            // текст и тыкают формулы; сворачивание — по шапке/шеврону.
            if (card.classList.contains('expanded') && e.target.closest('.bm-card-content')) return;
            card.classList.toggle('expanded');
        });

        return card;
    }

    document.addEventListener('DOMContentLoaded', () => {
        visitorId = getVisitorId();
        initFirebase();
        loadBookmarks();
        setTimeout(() => {
            initLazyBookmarkButtons();
            addBookmarksSidebarButton();
            restoreBookmarkTarget();
        }, 300);
    });
})();
