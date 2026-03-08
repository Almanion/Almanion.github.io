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
                if (bookmarksPanelOpen) renderBookmarksPanel();
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
        const boxes = topic ? Array.from(topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box')) : [];
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
            corollary: 'Следствие'
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
            corollary: '#6366f1'
        };
        return colors[type] || '#6b7280';
    }

    function addBookmarkButtons() {
        const selector = '.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box';
        document.querySelectorAll(selector).forEach(box => {
            if (box.querySelector('.bookmark-btn')) return;
            if (box.closest('.definition-box, .formula-box, .theorem-box, .remark-box')) {
                if (box.parentElement.closest('.definition-box, .formula-box, .theorem-box, .remark-box')) return;
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
            if (window.innerWidth > 768) return;
            const modal = getModal();
            if (!modal || modal.scrollTop > 5) return;
            startY = e.touches[0].clientY;
            currentY = startY;
            tracking = true;
            activated = false;
        }, { passive: true });

        overlay.addEventListener('touchmove', (e) => {
            if (!tracking) return;
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
        const boxes = topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box');
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
        const ref = getBookmarksRef();
        if (ref) {
            orderedIds.forEach((id, i) => {
                ref.child(id).child('order').set(i);
            });
        }
        localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
    }

    function renderBookmarksPanel() {
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
        const entries = sortedEntries();

        modal.innerHTML = '';

        const header = document.createElement('h2');
        header.style.cssText = 'margin-top: 0; margin-bottom: 1rem;';
        header.textContent = '🔖 Закладки';
        modal.appendChild(header);

        if (entries.length === 0) {
            const empty = document.createElement('p');
            empty.style.cssText = 'color: var(--text-secondary); text-align: center; padding: 2rem 0;';
            empty.innerHTML = 'Нет закладок.<br>Нажмите ☆ на любом блоке, чтобы добавить.';
            modal.appendChild(empty);
        } else {
            const hint = document.createElement('div');
            hint.style.cssText = 'font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.6rem;';
            hint.textContent = 'Удерживайте карточку для перемещения';
            modal.appendChild(hint);

            const list = document.createElement('div');
            list.className = 'bm-sortable-list';
            entries.forEach(bm => {
                const currentPage = location.pathname;
                const isLocal = bm.page === currentPage;
                const card = createBookmarkCard(bm, isLocal);
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
    }

    function initDragSort(list) {
        let dragItem = null;
        let placeholder = null;
        let longPressTimer = null;
        let startY = 0;
        let offsetY = 0;
        let moved = false;

        list.addEventListener('touchstart', (e) => {
            const card = e.target.closest('.bm-card');
            if (!card || e.target.closest('.bm-card-delete')) return;
            startY = e.touches[0].clientY;
            moved = false;

            longPressTimer = setTimeout(() => {
                dragItem = card;
                moved = true;
                const rect = card.getBoundingClientRect();
                offsetY = startY - rect.top;

                placeholder = document.createElement('div');
                placeholder.className = 'bm-drag-placeholder';
                placeholder.style.height = rect.height + 'px';
                card.parentNode.insertBefore(placeholder, card);

                card.classList.add('bm-dragging');
                card.style.position = 'fixed';
                card.style.left = rect.left + 'px';
                card.style.width = rect.width + 'px';
                card.style.top = (startY - offsetY) + 'px';
                card.style.zIndex = '99999';

                if (navigator.vibrate) navigator.vibrate(30);
            }, 400);
        }, { passive: true });

        list.addEventListener('touchmove', (e) => {
            if (longPressTimer && !dragItem) {
                const dy = Math.abs(e.touches[0].clientY - startY);
                if (dy > 8) { clearTimeout(longPressTimer); longPressTimer = null; }
            }
            if (!dragItem) return;
            e.preventDefault();
            const y = e.touches[0].clientY;
            dragItem.style.top = (y - offsetY) + 'px';

            const cards = [...list.querySelectorAll('.bm-card:not(.bm-dragging)')];
            for (const c of cards) {
                const r = c.getBoundingClientRect();
                const mid = r.top + r.height / 2;
                if (y < mid) {
                    list.insertBefore(placeholder, c);
                    return;
                }
            }
            list.appendChild(placeholder);
        }, { passive: false });

        list.addEventListener('touchend', () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            if (!dragItem) return;

            dragItem.classList.remove('bm-dragging');
            dragItem.style.cssText = '';
            if (placeholder && placeholder.parentNode) {
                placeholder.parentNode.insertBefore(dragItem, placeholder);
                placeholder.remove();
            }
            placeholder = null;

            const ids = [...list.querySelectorAll('.bm-card')].map(c => c.dataset.bmId);
            persistOrder(ids);
            dragItem = null;
        });

        list.addEventListener('touchcancel', () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            if (dragItem) {
                dragItem.classList.remove('bm-dragging');
                dragItem.style.cssText = '';
                if (placeholder) placeholder.remove();
                dragItem = null;
                placeholder = null;
            }
        });
    }

    function createSectionTitle(text) {
        const el = document.createElement('div');
        el.className = 'bookmarks-section-title';
        el.textContent = text;
        return el;
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

        if (isCurrentPage) {
            const box = findBoxById(bm.id);
            if (box) {
                const clone = box.cloneNode(true);
                clone.querySelectorAll('.bookmark-btn').forEach(b => b.remove());
                clone.style.cssText = 'margin: 0; border: none; box-shadow: none; border-radius: 0; border-left: none;';
                contentDiv.appendChild(clone);
            } else {
                contentDiv.textContent = bm.preview || '';
            }
        } else {
            contentDiv.textContent = bm.preview || '';
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
