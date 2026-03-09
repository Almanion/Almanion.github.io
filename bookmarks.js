// ============================================
// ЗАКЛАДКИ
// ============================================

(function() {
    'use strict';

    const VISITOR_ID_KEY = 'almanion_visitor_id';
    const LOCAL_BOOKMARKS_KEY = 'almanion_bookmarks';
    let db = null;
    let visitorId = null;
    let bookmarks = {};
    let bookmarksPanelOpen = false;
    let bmDragging = false;
    let lazyObserver = null;

    function getVisitorId() {
        let id = localStorage.getItem(VISITOR_ID_KEY);
        if (!id) {
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
            localStorage.setItem(VISITOR_ID_KEY, id);
        }
        return id;
    }

    function initFirebase() {
        if (typeof firebase === 'undefined') return false;
        if (!firebaseConfig || firebaseConfig.apiKey === "ВСТАВЬ_СВОЙ_API_KEY") return false;
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
        return true;
    }

    function getBookmarksRef() {
        if (!db || !visitorId) return null;
        return db.ref('bookmarks/' + visitorId);
    }

    function loadBookmarks() {
        try {
            bookmarks = JSON.parse(localStorage.getItem(LOCAL_BOOKMARKS_KEY) || '{}');
        } catch { bookmarks = {}; }

        const ref = getBookmarksRef();
        if (ref) {
            ref.on('value', (snap) => {
                const remote = snap.val() || {};
                const merged = { ...bookmarks, ...remote };
                bookmarks = merged;
                localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
                refreshAllButtons();
                if (bookmarksPanelOpen && !bmDragging) renderBookmarksPanel();
            }, () => {});
        }
    }

    function saveBookmark(id, data) {
        bookmarks[id] = data;
        const ref = getBookmarksRef();
        if (ref) {
            ref.child(id).set(data);
        }
        localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
    }

    function removeBookmark(id) {
        delete bookmarks[id];
        const ref = getBookmarksRef();
        if (ref) {
            ref.child(id).remove();
        }
        localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
    }

    function generateBookmarkId(box) {
        const topic = box.closest('.topic');
        const topicId = topic ? topic.id : 'unknown';
        const boxes = topic ? Array.from(topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box, .properties-box, .experiment-box, .derivation-box, .system-box')) : [];
        const idx = boxes.indexOf(box);
        return topicId + '_' + idx;
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

    function addBookmarkButtons() {
        const selector = '.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box, .properties-box, .experiment-box, .derivation-box, .system-box';
        document.querySelectorAll(selector).forEach(box => {
            if (box.querySelector('.bookmark-btn')) return;
            if (box.closest('.definition-box, .formula-box, .theorem-box, .remark-box, .properties-box, .experiment-box, .derivation-box, .system-box')) {
                if (box.parentElement.closest('.definition-box, .formula-box, .theorem-box, .remark-box, .properties-box, .experiment-box, .derivation-box, .system-box')) return;
            }

            const btn = document.createElement('button');
            btn.className = 'bookmark-btn';
            btn.setAttribute('aria-label', 'Добавить в закладки');
            const bmId = generateBookmarkId(box);
            btn.dataset.bmId = bmId;
            btn.innerHTML = bookmarks[bmId] ? '★' : '☆';
            if (bookmarks[bmId]) btn.classList.add('bookmarked');

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.bmId;
                if (bookmarks[id]) {
                    removeBookmark(id);
                    btn.innerHTML = '☆';
                    btn.classList.remove('bookmarked');
                } else {
                    const topic = box.closest('.topic');
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
                    btn.innerHTML = '★';
                    btn.classList.add('bookmarked');
                    btn.style.transform = 'scale(1.3)';
                    setTimeout(() => btn.style.transform = '', 200);
                }
                if (bookmarksPanelOpen) renderBookmarksPanel();
            });

            box.style.position = 'relative';
            box.appendChild(btn);
        });
    }

    function refreshAllButtons() {
        document.querySelectorAll('.bookmark-btn').forEach(btn => {
            const id = btn.dataset.bmId;
            if (bookmarks[id]) {
                btn.innerHTML = '★';
                btn.classList.add('bookmarked');
            } else {
                btn.innerHTML = '☆';
                btn.classList.remove('bookmarked');
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
        btn.textContent = '🔖 Закладки';

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
        const parts = bmId.split('_');
        const idx = parseInt(parts.pop());
        const topicId = parts.join('_');
        const topic = document.getElementById(topicId);
        if (!topic) return null;
        const boxes = topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box, .properties-box, .experiment-box, .derivation-box, .system-box');
        return boxes[idx] || null;
    }

    function sortedEntries() {
        return Object.entries(bookmarks)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => {
                const oa = typeof a.order === 'number' ? a.order : Infinity;
                const ob = typeof b.order === 'number' ? b.order : Infinity;
                if (oa !== ob) return oa - ob;
                return (b.timestamp || 0) - (a.timestamp || 0);
            });
    }

    function persistOrder(orderedIds) {
        orderedIds.forEach((id, i) => {
            if (bookmarks[id]) bookmarks[id].order = i;
        });
        localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
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
        const entries = sortedEntries().filter(bm => bm.page === currentPage);

        modal.innerHTML = '';

        const header = document.createElement('h2');
        header.style.cssText = 'margin-top: 0; margin-bottom: 1rem;';
        header.textContent = '🔖 Закладки';
        modal.appendChild(header);

        if (entries.length === 0) {
            const empty = document.createElement('p');
            empty.style.cssText = 'color: var(--text-secondary); text-align: center; padding: 2rem 0;';
            empty.innerHTML = 'Нет закладок на этой странице.<br>Нажмите ☆ на любом блоке, чтобы добавить.';
            modal.appendChild(empty);
        } else {
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.6rem;';
            hint.textContent = 'Удерживайте карточку для перемещения';
            modal.appendChild(hint);

            const list = document.createElement('div');
            list.className = 'bm-sortable-list';
            entries.forEach(bm => {
                const card = createBookmarkCard(bm, true);
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
                    }
                    delete el.dataset.lazyBmId;
                });
            }
        });
    }

    function initDragSort(list) {
        let dragItem = null;
        let placeholder = null;
        let longPressTimer = null;
        let pointerStartY = 0;
        let lastPointerY = 0;
        let initialTop = 0;
        let dragOffsetY = 0;
        let savedColor = '';
        let rafId = null;
        let needsRaf = false;
        let cachedModalTop = 0;
        let cachedModalBottom = 0;
        const modal = document.getElementById('bookmarksModal');

        function startDrag(card, pointerY) {
            dragItem = card;
            bmDragging = true;
            savedColor = card.style.borderLeftColor || '';

            if (lazyObserver) { lazyObserver.disconnect(); }

            const rect = card.getBoundingClientRect();
            initialTop = rect.top;
            dragOffsetY = pointerY - initialTop;
            if (modal) {
                const mr = modal.getBoundingClientRect();
                cachedModalTop = mr.top;
                cachedModalBottom = mr.bottom;
            }

            placeholder = document.createElement('div');
            placeholder.className = 'bm-drag-placeholder';
            placeholder.style.height = rect.height + 'px';
            card.parentNode.insertBefore(placeholder, card);

            list.style.userSelect = 'none';
            list.style.webkitUserSelect = 'none';
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';

            card.classList.add('bm-dragging');
            card.style.cssText =
                'position:fixed;z-index:99999;pointer-events:none;' +
                'left:' + rect.left + 'px;' +
                'width:' + rect.width + 'px;' +
                'top:' + initialTop + 'px;' +
                'margin:0;opacity:0.92;' +
                'box-shadow:0 8px 32px rgba(0,0,0,0.25);' +
                'border-left-color:' + savedColor + ';' +
                'will-change:transform;';

            if (navigator.vibrate) navigator.vibrate(30);
        }

        function tick() {
            rafId = null;
            if (!dragItem) return;

            // === READS first (no layout thrashing) ===
            const cards = list.querySelectorAll('.bm-card:not(.bm-dragging)');
            const positions = [];
            for (const c of cards) {
                const r = c.getBoundingClientRect();
                positions.push({ el: c, mid: r.top + r.height / 2 });
            }

            // === WRITES after ===
            dragItem.style.transform = 'translateY(' + (lastPointerY - dragOffsetY - initialTop) + 'px)';

            let keepScrolling = false;
            if (modal) {
                const edge = 50;
                const maxSpeed = 8;
                let delta = 0;
                if (lastPointerY < cachedModalTop + edge) {
                    delta = -maxSpeed * Math.max(0, 1 - (lastPointerY - cachedModalTop) / edge);
                } else if (lastPointerY > cachedModalBottom - edge) {
                    delta = maxSpeed * Math.max(0, 1 - (cachedModalBottom - lastPointerY) / edge);
                }
                if (Math.abs(delta) > 0.5) {
                    modal.scrollTop += delta;
                    keepScrolling = true;
                }
            }

            let placed = false;
            for (const { el, mid } of positions) {
                if (lastPointerY < mid) {
                    if (placeholder.nextSibling !== el) list.insertBefore(placeholder, el);
                    placed = true;
                    break;
                }
            }
            if (!placed && list.lastElementChild !== placeholder) {
                list.appendChild(placeholder);
            }

            needsRaf = false;
            if (keepScrolling) {
                needsRaf = true;
                rafId = requestAnimationFrame(tick);
            }
        }

        function scheduleRaf() {
            if (!needsRaf) {
                needsRaf = true;
                rafId = requestAnimationFrame(tick);
            }
        }

        function cleanup() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
            needsRaf = false;
            list.style.userSelect = '';
            list.style.webkitUserSelect = '';
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
        }

        function reattachLazy() {
            if (!lazyObserver) return;
            const modal = document.getElementById('bookmarksModal');
            if (!modal) return;
            modal.querySelectorAll('.bm-card-content[data-lazy-bm-id]').forEach(el => {
                lazyObserver.observe(el);
            });
        }

        function endDrag() {
            if (!dragItem) return;
            cleanup();
            dragItem.classList.remove('bm-dragging');
            dragItem.removeAttribute('style');
            if (savedColor) dragItem.style.borderLeftColor = savedColor;
            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.insertBefore(dragItem, placeholder);
                placeholder.remove();
            }
            placeholder = null;
            dragItem = null;
            bmDragging = false;

            if (modal) modal.style.overflow = 'hidden';
            requestAnimationFrame(() => {
                if (modal) modal.style.overflow = '';
                const ids = [...list.querySelectorAll('.bm-card')].map(c => c.dataset.bmId);
                persistOrder(ids);
                reattachLazy();
            });
        }

        function cancelDrag() {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            cleanup();
            if (dragItem) {
                dragItem.classList.remove('bm-dragging');
                dragItem.removeAttribute('style');
                if (savedColor) dragItem.style.borderLeftColor = savedColor;
                if (placeholder) placeholder.remove();
                dragItem = null;
                placeholder = null;
            }
            bmDragging = false;
        }

        function onPointerMove(y) {
            lastPointerY = y;
            scheduleRaf();
        }

        // === Touch events ===
        list.addEventListener('touchstart', (e) => {
            const card = e.target.closest('.bm-card');
            if (!card || e.target.closest('.bm-card-delete')) return;
            pointerStartY = e.touches[0].clientY;
            lastPointerY = pointerStartY;
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                startDrag(card, lastPointerY);
            }, 400);
        }, { passive: true });

        list.addEventListener('touchmove', (e) => {
            const y = e.touches[0].clientY;
            if (longPressTimer && !dragItem) {
                if (Math.abs(y - pointerStartY) > 8) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                lastPointerY = y;
                return;
            }
            if (!dragItem) return;
            e.preventDefault();
            e.stopPropagation();
            onPointerMove(y);
        }, { passive: false });

        list.addEventListener('touchend', (e) => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            if (!dragItem) return;
            e.stopPropagation();
            endDrag();
        });

        list.addEventListener('touchcancel', () => cancelDrag());

        // === Mouse events (desktop) ===
        list.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const card = e.target.closest('.bm-card');
            if (!card || e.target.closest('.bm-card-delete')) return;
            pointerStartY = e.clientY;
            lastPointerY = pointerStartY;
            longPressTimer = setTimeout(() => {
                longPressTimer = null;
                startDrag(card, lastPointerY);
            }, 400);

            function onMouseMove(ev) {
                const y = ev.clientY;
                if (longPressTimer && !dragItem) {
                    if (Math.abs(y - pointerStartY) > 8) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                    }
                    lastPointerY = y;
                    return;
                }
                if (!dragItem) return;
                ev.preventDefault();
                onPointerMove(y);
            }

            function onMouseUp() {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
                if (!dragItem) return;
                endDrag();
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    }

    function cloneBoxContent(box) {
        const clone = box.cloneNode(true);
        clone.querySelectorAll('.bookmark-btn').forEach(b => b.remove());
        clone.style.cssText = 'margin:0;border:none;box-shadow:none;border-radius:0;border-left:none;';
        return clone;
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
                }
                delete contentDiv.dataset.lazyBmId;
            });
        }, { root: document.getElementById('bookmarksModal'), rootMargin: '100px' });
    }

    function createBookmarkCard(bm, isCurrentPage) {
        const card = document.createElement('div');
        card.className = 'bm-card';
        const color = getTypeColor(bm.type);
        card.style.borderLeftColor = color;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'bm-card-header';

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

        const delBtn = document.createElement('button');
        delBtn.className = 'bm-card-delete';
        delBtn.title = 'Удалить';
        delBtn.textContent = '✕';
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

        card.addEventListener('click', () => {
            if (isCurrentPage) {
                const box = findBoxById(bm.id);
                if (box) {
                    closeBookmarksPanel();
                    if (typeof window.closeMobileMenu === 'function') {
                        window.closeMobileMenu();
                    }
                    setTimeout(() => {
                        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        box.classList.add('nav-highlight');
                        setTimeout(() => box.classList.remove('nav-highlight'), 1500);
                    }, 100);
                }
            } else {
                window.location.href = bm.page + '#' + bm.topicId;
            }
        });

        return card;
    }

    document.addEventListener('DOMContentLoaded', () => {
        visitorId = getVisitorId();
        initFirebase();
        loadBookmarks();
        setTimeout(() => {
            addBookmarkButtons();
            addBookmarksSidebarButton();
        }, 300);
    });
})();
