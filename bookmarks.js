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
        const ref = getBookmarksRef();
        if (ref) {
            ref.on('value', (snap) => {
                bookmarks = snap.val() || {};
                localStorage.setItem(LOCAL_BOOKMARKS_KEY, JSON.stringify(bookmarks));
                refreshAllButtons();
                if (bookmarksPanelOpen) renderBookmarksPanel();
            });
        } else {
            try {
                bookmarks = JSON.parse(localStorage.getItem(LOCAL_BOOKMARKS_KEY) || '{}');
            } catch { bookmarks = {}; }
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
        const navMenu = document.querySelector('.nav-menu');
        if (!navMenu) return;

        const section = document.createElement('div');
        section.className = 'nav-section';
        const btn = document.createElement('button');
        btn.className = 'knowledge-check-btn';
        btn.id = 'bookmarksBtn';
        btn.textContent = '🔖 Закладки';
        btn.style.marginTop = '0.25rem';

        btn.addEventListener('click', () => {
            toggleBookmarksPanel();
        });

        section.appendChild(btn);
        const otherSubjects = navMenu.querySelector('.other-subjects');
        if (otherSubjects) {
            navMenu.insertBefore(section, otherSubjects);
        } else {
            navMenu.appendChild(section);
        }
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

    function renderBookmarksPanel() {
        let overlay = document.getElementById('bookmarksOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'bookmarksOverlay';
            overlay.className = 'auth-overlay hidden';
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.add('hidden');
                    bookmarksPanelOpen = false;
                }
            });

            const modal = document.createElement('div');
            modal.id = 'bookmarksModal';
            modal.className = 'auth-modal';
            modal.style.cssText = 'max-width: 600px; max-height: 80vh; overflow-y: auto;';
            overlay.appendChild(modal);
            document.body.appendChild(overlay);
        }

        const modal = document.getElementById('bookmarksModal');
        const currentPage = location.pathname;
        const entries = Object.entries(bookmarks)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        const thisPage = entries.filter(e => e.page === currentPage);
        const otherPages = entries.filter(e => e.page !== currentPage);

        let html = '<h2 style="margin-top: 0; margin-bottom: 1rem;">🔖 Закладки</h2>';

        if (entries.length === 0) {
            html += '<p style="color: var(--text-secondary); text-align: center; padding: 2rem 0;">Нет закладок.<br>Нажмите ☆ на любом блоке, чтобы добавить.</p>';
        } else {
            if (thisPage.length > 0) {
                html += '<div class="bookmarks-section-title">На этой странице</div>';
                html += renderBookmarksList(thisPage, true);
            }
            if (otherPages.length > 0) {
                html += '<div class="bookmarks-section-title" style="margin-top: 1rem;">Другие страницы</div>';
                html += renderBookmarksList(otherPages, false);
            }
        }

        html += '<div style="text-align: center; margin-top: 1.5rem;">';
        html += '<button id="closeBookmarksBtn" class="auth-submit" style="background: var(--text-secondary);">Закрыть</button>';
        html += '</div>';

        modal.innerHTML = html;
        overlay.classList.remove('hidden');

        modal.querySelectorAll('.bookmark-entry').forEach(entry => {
            entry.addEventListener('click', () => {
                const id = entry.dataset.bmId;
                const bm = bookmarks[id];
                if (!bm) return;
                if (bm.page === currentPage) {
                    const topic = document.getElementById(bm.topicId);
                    if (topic) {
                        const boxes = topic.querySelectorAll('.definition-box, .formula-box, .theorem-box, .remark-box, .lemma-box, .example-box, .statement-box, .corollary-box');
                        const idx = parseInt(id.split('_').pop());
                        const target = boxes[idx];
                        if (target) {
                            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            target.classList.add('nav-highlight');
                            setTimeout(() => target.classList.remove('nav-highlight'), 1500);
                        }
                    }
                    overlay.classList.add('hidden');
                    bookmarksPanelOpen = false;
                    closeMobileMenu();
                } else {
                    window.location.href = bm.page + '#' + bm.topicId;
                }
            });
        });

        modal.querySelectorAll('.bookmark-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.bmId;
                removeBookmark(id);
                refreshAllButtons();
                renderBookmarksPanel();
            });
        });

        document.getElementById('closeBookmarksBtn')?.addEventListener('click', () => {
            overlay.classList.add('hidden');
            bookmarksPanelOpen = false;
        });
    }

    function renderBookmarksList(items, isCurrentPage) {
        let html = '<div class="bookmarks-list">';
        items.forEach(bm => {
            const color = getTypeColor(bm.type);
            const label = getTypeLabel(bm.type);
            html += `<div class="bookmark-entry" data-bm-id="${bm.id}">
                <div class="bookmark-color" style="background: ${color};"></div>
                <div class="bookmark-body">
                    <div class="bookmark-type" style="color: ${color};">${label}</div>
                    <div class="bookmark-preview">${escapeHtml(bm.preview || '')}</div>
                    ${!isCurrentPage ? `<div class="bookmark-page">${escapeHtml(bm.topicTitle || bm.pageTitle || '')}</div>` : ''}
                </div>
                <button class="bookmark-delete" data-bm-id="${bm.id}" title="Удалить">✕</button>
            </div>`;
        });
        html += '</div>';
        return html;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function closeMobileMenu() {
        if (typeof window.closeMobileMenu === 'function') {
            window.closeMobileMenu();
        }
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
