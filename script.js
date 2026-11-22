// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

// Безопасные обёртки для localStorage — приватный режим Safari и quota exceeded
// не должны крашить страницу. Используем тот же интерфейс, что и settings.js
// (если settings.js загружен раньше — берём оттуда).
const _safeGet = (typeof window !== 'undefined' && window.safeStorageGet)
    ? window.safeStorageGet
    : function(k){ try { return localStorage.getItem(k); } catch (_) { return null; } };
const _safeSet = (typeof window !== 'undefined' && window.safeStorageSet)
    ? window.safeStorageSet
    : function(k,v){ try { localStorage.setItem(k,v); return true; } catch (_) { return false; } };
const _safeRemove = (typeof window !== 'undefined' && window.safeStorageRemove)
    ? window.safeStorageRemove
    : function(k){ try { localStorage.removeItem(k); } catch (_) {} };

// Единая система коротких уведомлений. Остальные модули используют этот API,
// чтобы настройки, копирование и служебные сообщения выглядели одинаково.
const SITE_TOAST_ICONS = {
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></svg>',
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.4 4.3 3.1 17a2 2 0 0 0 1.7 3h14.4a2 2 0 0 0 1.7-3L13.6 4.3a2 2 0 0 0-3.2 0Z"/><path d="M12 9v4M12 16h.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>'
};

function getSiteToastRegion() {
    let region = document.getElementById('siteToastRegion');
    if (region) return region;
    region = document.createElement('div');
    region.id = 'siteToastRegion';
    region.className = 'site-toast-region';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'false');
    document.body.appendChild(region);
    return region;
}

function showSiteToast(message, options = {}) {
    const type = ['info', 'success', 'warning', 'error'].includes(options.type)
        ? options.type
        : 'info';
    const duration = Number.isFinite(options.duration) ? Math.max(0, options.duration) : 2800;
    const region = getSiteToastRegion();
    const toast = document.createElement('div');
    toast.className = `site-toast site-toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `
        <span class="site-toast-icon">${SITE_TOAST_ICONS[type]}</span>
        <span class="site-toast-message"></span>
        <button type="button" class="site-toast-close" aria-label="Закрыть уведомление">×</button>`;
    toast.querySelector('.site-toast-message').textContent = String(message || '');

    let timer = 0;
    const dismiss = () => {
        if (toast.classList.contains('is-leaving')) return;
        window.clearTimeout(timer);
        toast.classList.add('is-leaving');
        window.setTimeout(() => toast.remove(), 180);
    };
    const scheduleDismiss = () => {
        if (duration > 0) timer = window.setTimeout(dismiss, duration);
    };

    toast.querySelector('.site-toast-close').addEventListener('click', dismiss);
    toast.addEventListener('mouseenter', () => window.clearTimeout(timer));
    toast.addEventListener('mouseleave', scheduleDismiss);
    region.appendChild(toast);
    while (region.children.length > 3) region.firstElementChild?.remove();
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    scheduleDismiss();
    return { dismiss, element: toast };
}

window.AlmanionToast = { show: showSiteToast };

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const hadController = !!navigator.serviceWorker.controller;

        navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
            .then((registration) => {
                window.__almanionServiceWorker = registration;

                // Home has no unsaved document: adopt a waiting cache fix
                // there. Reading/editor tabs are never reloaded.
                if (document.body.classList.contains('home-page')) {
                    const activate = () => {
                        if (registration.waiting) registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                    };
                    activate();
                    registration.addEventListener('updatefound', () => {
                        const worker = registration.installing;
                        if (worker) worker.addEventListener('statechange', () => {
                            if (worker.state === 'installed') activate();
                        });
                    });
                }
            })
            .catch(() => {});

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController) return;
            // Новая версия активируется без принудительной перезагрузки. Так
            // ввод в конструкторе и незавершённая проверка знаний не теряются.
            window.__almanionUpdateReady = true;
            window.dispatchEvent(new CustomEvent('almanion-update-ready'));
        });
    });
}

window.addEventListener('appinstalled', () => {
    showSiteToast('Almanion установлен как приложение', { type: 'success' });
});

// Guard от двойной инициализации — DOMContentLoaded может прилететь дважды
// при некоторых редких сценариях (SPA-навигация, перерегистрация SW и т.п.).
let __initDone = false;
document.addEventListener('DOMContentLoaded', () => {
    if (__initDone) return;
    __initDone = true;

    initMath();
    initNavigation();
    window.AlmanionSearch?.init(); // Other note pages load search on first focus.
    initScrollEffects();
    initDerivationToggles();
    initProofToggles();
    initMobileMenu();
    initBottomSheetSwipe();
    initSidebarCollapse();
    initCopyableBlocks();
    initSelectionDefinitions();
});

// ============================================
// ПЕРЕКЛЮЧЕНИЕ ТЕМЫ
// ============================================
// Управление темой полностью перенесено в settings.js (4 темы: light/dark/sepia/midnight).
// FOUC-защита — inline-скрипт в <body> каждой HTML-страницы, применяющий тему
// до парсинга остальных скриптов. Здесь оставлять initTheme() больше нет смысла.


// ============================================
// МАТЕМАТИЧЕСКИЕ ФОРМУЛЫ (KaTeX)
// ============================================

function initMath() {
    if (document.body?.hasAttribute('data-no-math')) return;
    // Если на странице нет ни одного math-блока — KaTeX не нужен, не дёргаем CDN.
    // (index.html и admin.html не имеют формул — нет смысла ждать загрузки 15 секунд.)
    const hasMathContent = !!document.querySelector(
        '.formula-box, .derivation-content, .proof-content, .definition-box, ' +
        '.theorem-box, .lemma-box, .statement-box, .corollary-box, .system-box, ' +
        '.derivation-box, .proof-box, .topic, .content-section'
    );
    if (!hasMathContent) return;

    const topics = Array.from(document.querySelectorAll('.main-content .topic[id]'));
    const pending = new Set();
    let observer = null;
    let waitTimer = 0;
    let waitStartedAt = 0;
    const scheduleIdle = window.requestIdleCallback
        ? callback => window.requestIdleCallback(callback, { timeout: 900 })
        : callback => window.setTimeout(() => callback(null), 30);

    function markNestedBlocks(root) {
        if (root.matches?.('.derivation-content, .proof-content')) root.dataset.latexRendered = '1';
        root.querySelectorAll?.('.derivation-content, .proof-content').forEach(el => {
            el.dataset.latexRendered = '1';
        });
    }

    function render(root) {
        if (!root || root.dataset?.latexRendered === '1') return true;
        if (typeof renderMathInElement === 'undefined') {
            pending.add(root);
            waitForKaTeX();
            return false;
        }
        try {
            renderMathInElement(root, KATEX_OPTIONS);
            root.dataset.latexRendered = '1';
            markNestedBlocks(root);
            pending.delete(root);
            return true;
        } catch (_) {
            return false;
        }
    }

    function flushPending() {
        Array.from(pending).forEach(render);
    }

    function waitForKaTeX() {
        if (waitTimer) return;
        if (!waitStartedAt) waitStartedAt = Date.now();
        waitTimer = window.setTimeout(() => {
            waitTimer = 0;
            if (typeof renderMathInElement !== 'undefined') {
                flushPending();
                return;
            }
            if (Date.now() - waitStartedAt < 15000) waitForKaTeX();
        }, 120);
    }

    function renderAll() {
        if (observer) observer.disconnect();
        if (topics.length) topics.forEach(render);
        else render(document.body);
    }

    window.AlmanionMath = { render, renderAll };

    if (!topics.length) {
        render(document.body);
        return;
    }

    const hashTarget = window.location.hash
        ? document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.closest('.topic[id]')
        : null;
    const firstTarget = hashTarget || topics[0];
    render(firstTarget);

    // Остальные темы обрабатываются только перед тем, как действительно понадобятся.
    // Это сохраняет формулы и оформление, но не заставляет KaTeX строить тысячи DOM-узлов
    // до первого отображения страницы.
    if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                render(entry.target);
            });
        }, { rootMargin: '700px 0px' });
        topics.forEach(topic => {
            if (topic !== firstTarget) observer.observe(topic);
        });
    } else {
        const queue = topics.filter(topic => topic !== firstTarget);
        const drain = deadline => {
            while (queue.length && (!deadline || deadline.timeRemaining() > 4)) render(queue.shift());
            if (queue.length) scheduleIdle(drain);
        };
        scheduleIdle(drain);
    }

    window.addEventListener('beforeprint', renderAll);
}

// ============================================
// НАВИГАЦИЯ
// ============================================

function initNavigation() {
    // На Матцентре своя навигация в модулях matcenter/
    if (document.body.classList.contains('matcenter-page')) return;

    const navLinks = document.querySelectorAll('.nav-link');
    // Поддерживаем оба варианта: .topic и .content-section
    const topics = document.querySelectorAll('.topic, .content-section');
    const navGroupToggles = document.querySelectorAll('.nav-group-toggle');
    
    // Группы раскрыты при загрузке; состояние не сохраняется.
    document.querySelectorAll('.nav-group').forEach(group => {
        group.classList.add('open');
    });
    
    navGroupToggles.forEach((toggle, index) => {
        const group = toggle.closest('.nav-group');
        const submenu = group?.querySelector(':scope > .nav-submenu');
        if (!group || !submenu) return;
        const icon = toggle.querySelector('.toggle-icon');
        if (icon) {
            icon.setAttribute('aria-hidden', 'true');
            icon.innerHTML = '<svg viewBox="0 0 24 24" focusable="false"><path d="m6 9 6 6 6-6"/></svg>';
            toggle.appendChild(icon);
        }
        if (!submenu.id) submenu.id = `nav-submenu-${index + 1}`;
        toggle.setAttribute('aria-controls', submenu.id);
        toggle.setAttribute('aria-expanded', 'true');
        toggle.addEventListener('click', () => {
            const isOpen = group.classList.toggle('open');
            toggle.setAttribute('aria-expanded', String(isOpen));
        });
    });
    
    // Клик по ссылке навигации
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                closeMobileMenu();

                if (window.experimentalReader
                    && window.experimentalReader.isActive()
                    && window.experimentalReader.goToId(targetId, { source: 'sidebar' })) {
                    e.preventDefault();
                    return;
                }

                targetElement.classList.add('nav-highlight');
                setTimeout(() => targetElement.classList.remove('nav-highlight'), 1500);
            }
        });
    });
    
    // Автоматическое выделение активной секции через IntersectionObserver
    let currentSection = '';
    
    function setActiveLink(sectionId) {
        if (window.experimentalReader?.isActive()) return;
        if (currentSection === sectionId) return;
        currentSection = sectionId;
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            link.removeAttribute('aria-current');
            
            if (link.getAttribute('href') === `#${sectionId}`) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'location');
                
            }
        });
    }
    
    // Собираем только секции с id
    const observedTopics = Array.from(topics).filter(t => t.getAttribute('id'));
    
    if ('IntersectionObserver' in window && observedTopics.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            // Находим самую верхнюю видимую секцию
            let bestEntry = null;
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (!bestEntry || entry.boundingClientRect.top < bestEntry.boundingClientRect.top) {
                        bestEntry = entry;
                    }
                }
            });
            
            if (bestEntry) {
                setActiveLink(bestEntry.target.getAttribute('id'));
            } else {
                // Если ни одна секция не видна — берём ближайшую выше viewport
                let closest = null;
                let closestDist = Infinity;
                observedTopics.forEach(topic => {
                    const rect = topic.getBoundingClientRect();
                    if (rect.top <= 120 && (120 - rect.top) < closestDist) {
                        closestDist = 120 - rect.top;
                        closest = topic;
                    }
                });
                if (closest) {
                    setActiveLink(closest.getAttribute('id'));
                }
            }
        }, {
            rootMargin: '-80px 0px -60% 0px',
            threshold: [0, 0.1]
        });
        
        observedTopics.forEach(topic => observer.observe(topic));
    } else {
        // Fallback для старых браузеров
        let scrollTimeout;
        function updateActiveSection() {
            let section = '';
            observedTopics.forEach(topic => {
                if (topic.getBoundingClientRect().top <= 120) {
                    section = topic.getAttribute('id');
                }
            });
            setActiveLink(section);
        }
        window.addEventListener('scroll', () => {
            if (scrollTimeout) cancelAnimationFrame(scrollTimeout);
            scrollTimeout = requestAnimationFrame(updateActiveSection);
        }, { passive: true });
    }
}

// ============================================
// ЭФФЕКТЫ ПРИ СКРОЛЛЕ
// ============================================

function initScrollEffects() {
    // Кнопка "Наверх"
    const scrollToTopBtn = document.getElementById('scrollToTop');
    
    if (scrollToTopBtn) {
        let scrollBtnTimeout;
        
        function updateScrollButton() {
            if (window.pageYOffset > 300) {
                scrollToTopBtn.classList.add('visible');
            } else {
                scrollToTopBtn.classList.remove('visible');
            }
        }
        
        window.addEventListener('scroll', () => {
            if (scrollBtnTimeout) {
                cancelAnimationFrame(scrollBtnTimeout);
            }
            scrollBtnTimeout = requestAnimationFrame(updateScrollButton);
        }, { passive: true });
        
        scrollToTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    
    initNoteEntrances();
}

function initNoteEntrances() {
    const main = document.querySelector('main.main-content');
    if (!main || !window.IntersectionObserver) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seen = new WeakSet();
    const playing = new Set();
    // Only outer blocks move. Headings, nested proofs and their figures stay together.
    const blocks = ':is([data-note-block], .definition-box, .formula-box, .theorem-box, .proof-box, .experiment-box, .example-box, .remark-box, .english-word-list, p, ul, ol, figure, table, blockquote, details):not(h2, h3, h4, h5, h6, [hidden])';
    let observer;
    let scope;
    let level;

    function clearBlock(block) {
        delete block.dataset.noteEntrance;
        block.style.removeProperty('--note-enter-order');
        playing.delete(block);
    }

    function finished(event) {
        if (event.animationName === 'almanion-element-in' && playing.has(event.target)) {
            clearBlock(event.target);
        }
    }
    main.addEventListener('animationend', finished);
    main.addEventListener('animationcancel', finished);

    function motionLevel() {
        const setting = document.documentElement.dataset.pageMotion;
        if (reduced.matches || setting === 'off' || document.body.classList.contains('animations-off')) return 'off';
        return setting === 'medium' || document.body.classList.contains('animations-medium') ? 'medium' : 'max';
    }

    function watch(topic, direction = null, refresh = false) {
        const nextScope = topic || main;
        const nextLevel = motionLevel();
        if (!refresh && nextScope === scope && nextLevel === level) return;
        observer?.disconnect();
        observer = null;
        playing.forEach(clearBlock);
        scope = nextScope;
        level = nextLevel;
        if (level === 'off' || (level === 'medium' && !direction)) return;

        const children = scope.querySelectorAll((topic ? ':scope > ' : '.topic > ') + blocks);
        if (!children.length) return;
        let first = true;
        const current = new IntersectionObserver(entries => {
            if (current !== observer) return;
            let order = 0;
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                const block = entry.target;
                current.unobserve(block);
                const fresh = !seen.has(block);
                seen.add(block);
                const bounds = entry.rootBounds;
                const atEdge = bounds && entry.boundingClientRect.top >= bounds.bottom - Math.min(120, bounds.height * 0.22);
                const effect = first ? direction : (fresh && atEdge && level === 'max' ? 'scroll' : null);
                if (!effect || order >= 3 || block.matches(':focus-within, :target')) continue;
                block.style.setProperty('--note-enter-order', String(order++));
                block.dataset.noteEntrance = effect;
                playing.add(block);
            }
            first = false;
            if (level === 'medium') current.disconnect();
        });
        observer = current;
        children.forEach(block => current.observe(block));
    }

    function sync() { watch(main.querySelector('.topic.exp-reader-current')); }
    window.addEventListener('almanion:topic-visible', event => watch(event.detail.topic, event.detail.entrance));
    window.addEventListener('experimental-mode-changed', () => queueMicrotask(sync));
    window.addEventListener('almanion-settings-changed', () => queueMicrotask(sync));
    window.addEventListener('almanion-settings-applied', () => queueMicrotask(sync));
    const refresh = () => watch(main.querySelector('.topic.exp-reader-current'), null, true);
    window.addEventListener('almanion:content-ready', refresh);
    window.addEventListener('almanion:note-filter-changed', refresh);
    window.addEventListener('pagehide', () => playing.forEach(clearBlock));
    reduced.addEventListener?.('change', sync);
    requestAnimationFrame(sync);
}

// ============================================
// ПЕРЕКЛЮЧАТЕЛИ ВЫВОДОВ ФОРМУЛ
// ============================================

// Универсальная иконка "книга" для кнопок toggle вывода/доказательства
const TOGGLE_BOOK_ICON = '<svg class="toggle-book-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

const KATEX_OPTIONS = {
    delimiters: [
        {left: '\\[', right: '\\]', display: true},
        {left: '\\(', right: '\\)', display: false},
        {left: '$', right: '$', display: false}
    ],
    macros: {
        "\\divby": "\\mathrel{\\scriptstyle\\vdots}",
        "\\ndivby": "\\mathrel{\\scriptstyle\\not\\vdots}"
    },
    throwOnError: false,
    trust: true
};

// Рендерим формулы один раз на элемент, помечая флагом.
function renderMathOnce(el) {
    if (!el) return;
    if (el.dataset.latexRendered === '1') return;
    if (window.AlmanionMath) {
        window.AlmanionMath.render(el);
        return;
    }
    if (typeof renderMathInElement === 'undefined') return;
    renderMathInElement(el, KATEX_OPTIONS);
    el.dataset.latexRendered = '1';
}

function setToggleLabel(button, text) {
    button.innerHTML = TOGGLE_BOOK_ICON + '<span>' + text + '</span>';
}

function initDerivationToggles() {
    document.querySelectorAll('.derivation-content').forEach((derivationContent) => {
        derivationContent.classList.add('show');
        derivationContent.removeAttribute('aria-hidden');
    });
    document.querySelectorAll('.toggle-derivation').forEach(button => button.remove());
}

// ============================================
// TOGGLE ДОКАЗАТЕЛЬСТВ
// ============================================

function initProofToggles() {
    document.querySelectorAll('.proof-content').forEach((proofContent, index) => {
        proofContent.classList.add('show');
        proofContent.removeAttribute('aria-hidden');
        if (!proofContent.id) proofContent.id = `proof-content-${index + 1}`;
    });

    document.querySelectorAll('.toggle-proof').forEach(button => button.remove());
}

// ============================================
// МОБИЛЬНОЕ МЕНЮ
// ============================================

let mobileMenuOpener = null;
function mobileMenuButton() {
    return [...document.querySelectorAll('#expBottomNav [aria-controls="sidebar"], #menuToggle')].find(button => button.getClientRects().length);
}

function syncSidebarVisibility(sidebar) {
    const mobile = window.innerWidth <= 768;
    const open = sidebar.classList.contains('open');
    sidebar.inert = document.body.classList.contains('matcenter-auth-open') || (mobile ? !open : sidebar.classList.contains('collapsed'));
    document.querySelectorAll('#menuToggle, #expBottomNav [aria-controls="sidebar"]').forEach(button => button.setAttribute('aria-expanded', String(open)));
    document.getElementById('menuToggle')?.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
}

function initMobileMenu() {
    // Guard: вешаем document.click только один раз. При повторных вызовах
    // не будем устраивать дубли обработчиков (которые приводили к "двойному закрытию").
    if (window.__mobileMenuInit) return;

    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');

    // На страницах без сайдбара (index.html, the-secret-game.html) — тихо выходим.
    // Не warning'уем — это нормальное состояние.
    if (!menuToggle || !sidebar) {
        return;
    }
    window.__mobileMenuInit = true;
    sidebar.querySelector('#closeSidebar')?.remove();
    
    // Создаём оверлей, если его ещё нет
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }
    
    menuToggle.setAttribute('aria-controls', sidebar.id);
    syncSidebarVisibility(sidebar);
    let lastFocused = document.activeElement;
    document.addEventListener('focusin', event => { lastFocused = event.target; });
    matchMedia('(max-width: 768px)').addEventListener('change', event => {
        const focusInside = sidebar.contains(document.activeElement) || (document.activeElement === document.body && sidebar.contains(lastFocused));
        const collapsed = !event.matches && (usesTabletDrawer() || _safeGet('sidebarCollapsed') === 'true');
        sidebar.classList.toggle('collapsed', collapsed);
        document.body.classList.toggle('sidebar-collapsed', collapsed);
        closeMobileMenu(false);
        if (focusInside && sidebar.inert) (event.matches ? mobileMenuButton() : document.querySelector('.sidebar-expand-btn'))?.focus({ preventScroll: true });
    });
    menuToggle.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) closeMobileMenu();
        else openMobileMenu(menuToggle);
    });
    
    // Закрытие при клике/тапе на оверлей
    function dismissDrawer() {
        if (usesTabletDrawer()) collapseSidebar();
        else closeMobileMenu();
    }
    overlay.addEventListener('click', dismissDrawer);
    overlay.addEventListener('touchend', (e) => {
        e.preventDefault();
        dismissDrawer();
    });
    
    // Закрытие при клике вне сайдбара (только на мобильных)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
                closeMobileMenu();
            }
        }
    });
}

function openMobileMenu(opener) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (!sidebar || document.body.classList.contains('matcenter-auth-open')) return;
    if (!sidebar.classList.contains('open')) mobileMenuOpener = opener || mobileMenuButton();
    sidebar.classList.add('open');
    sidebar.classList.remove('collapsed');
    sidebar.style.transform = '';
    if (overlay) {
        overlay.classList.add('active');
    }
    
    if (window.innerWidth <= 768) {
        document.body.classList.add('sidebar-open');
    }
    syncSidebarVisibility(sidebar);
    const first = [...sidebar.querySelectorAll('button, a[href], input')].find(el => !el.disabled && el.getClientRects().length);
    first?.focus({ preventScroll: true });
    revealCurrentNav(sidebar);
}

function revealCurrentNav(sidebar, focusLink = false) {
    if (!sidebar || sidebar.inert) return;
    const link = sidebar.querySelector('.nav-link[aria-current="location"], .nav-link.active');
    if (!link) return;
    for (let group = link.closest('.nav-group'); group; group = group.parentElement.closest('.nav-group')) {
        group.classList.add('open');
        group.querySelector(':scope > .nav-group-toggle')?.setAttribute('aria-expanded', 'true');
    }
    const menu = link.closest('.nav-menu');
    const scroller = menu && menu.clientHeight < menu.scrollHeight ? menu : sidebar;
    const rect = link.getBoundingClientRect();
    const offset = rect.top - scroller.getBoundingClientRect().top;
    const head = scroller === sidebar ? sidebar.querySelector('.sidebar-header')?.offsetHeight || 0 : 0;
    if (offset < head + 24 || offset + rect.height > scroller.clientHeight - 24) {
        scroller.scrollTop += offset - head - (scroller.clientHeight - head - rect.height) / 2;
    }
    if (focusLink) link.focus({ preventScroll: true });
}

function closeMobileMenu(restoreFocus = true) {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    const wasOpen = sidebar?.classList.contains('open');
    if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.style.transform = '';
        syncSidebarVisibility(sidebar);
    }
    if (overlay) {
        overlay.classList.remove('active');
    }

    document.body.classList.remove('sidebar-open');
    if (wasOpen && restoreFocus && mobileMenuOpener?.getClientRects().length) mobileMenuOpener.focus({ preventScroll: true });
    mobileMenuOpener = null;
}

function initBottomSheetSwipe() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    let startY = 0;
    let currentY = 0;
    let tracking = false;
    let activated = false;
    const DEAD_ZONE = 12;

    sidebar.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 768 || !sidebar.classList.contains('open')) return;
        if (sidebar.scrollTop > 5 || e.target.closest('.nav-menu')?.scrollTop > 5) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        tracking = true;
        activated = false;
    }, { passive: true });

    sidebar.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;

        if (!activated) {
            if (deltaY > DEAD_ZONE) {
                activated = true;
                startY = currentY;
                sidebar.style.transition = 'none';
            }
            return;
        }

        const swipeDelta = currentY - startY;
        if (swipeDelta > 0) {
            e.preventDefault();
            sidebar.style.transform = `translateY(${swipeDelta}px)`;
            const overlay = document.querySelector('.sidebar-overlay');
            if (overlay) {
                overlay.style.opacity = Math.max(0, 1 - swipeDelta / 300);
            }
        }
    }, { passive: false });

    sidebar.addEventListener('touchend', () => {
        if (!tracking) return;
        tracking = false;
        if (!activated) return;
        activated = false;

        const overlay = document.querySelector('.sidebar-overlay');
        const deltaY = currentY - startY;

        if (deltaY > 60) {
            sidebar.style.transition = 'transform 0.25s ease-out';
            sidebar.style.transform = 'translateY(100vh)';
            if (overlay) {
                overlay.style.transition = 'opacity 0.25s ease-out';
                overlay.style.opacity = '0';
            }
            setTimeout(() => {
                closeMobileMenu();
                sidebar.style.transition = '';
                sidebar.style.transform = '';
                if (overlay) {
                    overlay.style.transition = '';
                    overlay.style.opacity = '';
                }
            }, 250);
        } else {
            sidebar.style.transition = 'transform 0.25s ease-out';
            sidebar.style.transform = '';
            if (overlay) overlay.style.opacity = '';
            setTimeout(() => {
                sidebar.style.transition = '';
            }, 250);
        }
    });
}

function updateSidebarHeight() {
    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.classList.remove('collapsed');
        }
        document.body.classList.remove('sidebar-collapsed');
    }
}

window.addEventListener('resize', updateSidebarHeight);
window.addEventListener('orientationchange', () => {
    // Небольшая задержка, чтобы браузер успел обновить размеры
    setTimeout(updateSidebarHeight, 150);
});

// Обновление при изменении визуального viewport (клавиатура на мобильных и т.п.)
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateSidebarHeight);
}

// ============================================
// СВОРАЧИВАНИЕ САЙДБАРА (ДЕСКТОП)
// ============================================

const tabletReaderWidth = window.matchMedia('(min-width: 769px) and (max-width: 1050px)');

function usesTabletDrawer() {
    return tabletReaderWidth.matches && document.body.classList.contains('tablet-reader-layout');
}

function initSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    // Не инициализируем на страницах без сайдбара (например, index.html)
    const mainContent = document.querySelector('.main-content');
    if (!mainContent) return;
    
    // Вставляем кнопку сворачивания в хедер сайдбара (рядом с другими кнопками)
    const sidebarHeader = sidebar.querySelector('.sidebar-header');
    
    let collapseBtn = document.querySelector('.sidebar-collapse-btn');
    if (!collapseBtn && sidebarHeader) {
        collapseBtn = document.createElement('button');
        collapseBtn.className = 'sidebar-collapse-btn';
        collapseBtn.title = 'Свернуть меню (горячая клавиша [)';
        collapseBtn.setAttribute('aria-label', 'Свернуть меню навигации');
        collapseBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>';
        
        // Вставляем в контейнер кнопок если он уже есть, иначе в хедер
        // (settings.js позже подхватит кнопку в контейнер)
        const headerButtons = sidebarHeader.querySelector('.sidebar-header-buttons');
        if (headerButtons) {
            headerButtons.insertBefore(collapseBtn, headerButtons.firstChild);
        } else {
            sidebarHeader.appendChild(collapseBtn);
        }
    }
    
    // Создаём кнопку для разворачивания (отдельная, за пределами сайдбара)
    let expandBtn = document.querySelector('.sidebar-expand-btn');
    if (!expandBtn) {
        expandBtn = document.createElement('button');
        expandBtn.className = 'sidebar-expand-btn';
        expandBtn.title = 'Развернуть меню (горячая клавиша [)';
        expandBtn.setAttribute('aria-label', 'Развернуть меню навигации');
        expandBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>';
        document.body.appendChild(expandBtn);
    }
    
    // Восстанавливаем состояние из localStorage
    const isReader = !!mainContent.querySelector('.content-section > .topic') && !document.body.classList.contains('matcenter-page');
    document.body.classList.toggle('tablet-reader-layout', isReader);
    const isCollapsed = usesTabletDrawer() || _safeGet('sidebarCollapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
    }
    syncSidebarVisibility(sidebar);
    expandBtn.setAttribute('aria-controls', sidebar.id);
    if (isReader) {
        tabletReaderWidth.addEventListener('change', () => {
            const collapsed = usesTabletDrawer() || (window.innerWidth > 768 && _safeGet('sidebarCollapsed') === 'true');
            const focusInside = sidebar.contains(document.activeElement);
            sidebar.classList.toggle('collapsed', collapsed);
            document.body.classList.toggle('sidebar-collapsed', collapsed);
            syncSidebarVisibility(sidebar);
            if (collapsed && focusInside) expandBtn.focus({ preventScroll: true });
        });
        sidebar.addEventListener('click', event => {
            if (usesTabletDrawer() && event.target.closest('a.nav-link')) collapseSidebar();
        });
        document.addEventListener('keydown', event => {
            if (!usesTabletDrawer() || sidebar.inert || event.defaultPrevented) return;
            if ([...document.querySelectorAll('[aria-modal="true"], dialog[open]')].some(dialog => dialog.getClientRects().length)) return;
            if (event.key === 'Escape') collapseSidebar();
            if (event.key === 'Tab') {
                const buttons = [...sidebar.querySelectorAll('a[href],button:not(:disabled),input,select,[tabindex="0"]')].filter(el => el.getClientRects().length && el.tabIndex >= 0);
                const end = event.shiftKey ? buttons[0] : buttons.at(-1);
                if (document.activeElement === end) {
                    event.preventDefault();
                    (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
                }
            }
        });
    }
    
    collapseBtn.addEventListener('click', () => {
        collapseSidebar();
    });
    
    expandBtn.addEventListener('click', () => {
        expandSidebar();
    });
}

function collapseSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.classList.add('collapsed');
    document.body.classList.add('sidebar-collapsed');
    if (!usesTabletDrawer()) _safeSet('sidebarCollapsed', 'true');
    syncSidebarVisibility(sidebar);
    document.querySelector('.sidebar-expand-btn')?.focus({ preventScroll: true });
}

function expandSidebar(opener) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.classList.remove('collapsed');
    document.body.classList.remove('sidebar-collapsed');
    if (!usesTabletDrawer()) _safeSet('sidebarCollapsed', 'false');
    syncSidebarVisibility(sidebar);
    sidebar.querySelector('.sidebar-collapse-btn')?.focus({ preventScroll: true });
    revealCurrentNav(sidebar, !!opener);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    if (sidebar.classList.contains('collapsed')) {
        expandSidebar();
    } else {
        collapseSidebar();
    }
}

// ============================================
// ГОРЯЧИЕ КЛАВИШИ
// ============================================

document.addEventListener('keydown', (e) => {
    // Ctrl + K или Cmd + K для фокуса на поиске
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            const homeSearch = document.getElementById('homeSearchOpen');
            if (homeSearch) { homeSearch.click(); return; }
            if (window.innerWidth > 768 && searchInput.closest('#sidebar.collapsed')) expandSidebar();
            if (window.innerWidth <= 768 && document.body.classList.contains('matcenter-page')) {
                const mobileInput = document.getElementById('mobileSearchInput');
                if (mobileInput?.getClientRects().length) {
                    mobileInput.focus();
                    mobileInput.select();
                    return;
                }
            } else if (window.innerWidth <= 768 && searchInput.closest('#sidebar, .reader-search-dialog')) {
                openReaderSearch(document.querySelector('#expBottomNav [aria-controls="readerSearchDialog"]'));
                return;
            }
            searchInput.focus();
            searchInput.select();
        }
    }
    
    // Escape для закрытия мобильного меню
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) {
            closeMobileMenu();
        }
    }
    
    // [ для сворачивания/разворачивания сайдбара (только десктоп)
    if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey && window.innerWidth > 768) {
        const searchInput = document.getElementById('searchInput');
        // Не срабатываем если фокус на поле ввода
        if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
            return;
        }
        toggleSidebar();
    }
});

// ============================================
// КОПИРОВАНИЕ БЛОКОВ ДЛЯ WORD
// ============================================

const COPYABLE_BLOCK_SELECTOR = [
    '.properties-box',
    '.topic',
    '.definition-box',
    '.formula-box',
    '.remark-box',
    '.reminder-box',
    '.experiment-box',
    '.derivation-box',
    '.theorem-box',
    '.lemma-box',
    '.example-box',
    '.statement-box',
    '.corollary-box',
    '.proof-box',
    '.exercise-box'
].join(', ');

// SVG-иконки для кнопки копирования блока
const COPY_ICONS = {
    copy:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
    cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>'
};

// На заголовочные элементы и контейнеры разделов copy-btn не добавляем.
// (Сам раздел .topic — это обёртка с заголовком и блоками внутри, у каждого блока уже своя copy-кнопка.)
const COPY_EXCLUDE_SELECTOR = 'h1, h2, h3, h4, h5, h6, .topic, .topic-title, .subsection-title, .section-title';

function addCopyButtons(root = document) {
    root.querySelectorAll(COPYABLE_BLOCK_SELECTOR).forEach(block => {
        if (block.dataset.copyReady === 'true') return;
        if (block.matches(COPY_EXCLUDE_SELECTOR)) return;

        block.dataset.copyReady = 'true';
        block.classList.add('copyable-block');

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'copy-block-btn';
        copyBtn.innerHTML = COPY_ICONS.copy;
        copyBtn.title = 'Скопировать блок для Word';
        copyBtn.setAttribute('aria-label', 'Скопировать блок для Word');

        copyBtn.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            // detail > 0 — активировано мышью/тачем (а не клавиатурой)
            const viaPointer = event.detail > 0;

            try {
                const payload = buildWordCopyPayload(block);
                await writeRichClipboard(payload.html, payload.text);
                showCopyState(copyBtn, COPY_ICONS.check, 'is-copied');
            } catch (error) {
                console.error('Ошибка копирования блока:', error);
                showCopyState(copyBtn, COPY_ICONS.cross, 'is-error');
            }

            // После клика мышью снимаем фокус: иначе блок остаётся в :focus-within
            // и кнопка «залипает» видимой навсегда (пока не кликнешь в другое место).
            // Для клавиатуры фокус сохраняем — там работает :focus-visible.
            if (viaPointer) copyBtn.blur();
        });

        block.appendChild(copyBtn);
    });
}

window.addEventListener('almanion:content-ready', event => {
    addCopyButtons(event.detail?.root || document);
});

function initSelectionDefinitions() {
    if (!document.querySelector('.main-content')) return;
    let pending;
    function resource(tag, url) {
        return new Promise((resolve, reject) => {
            const node = document.createElement(tag);
            if (tag === 'link') { node.rel = 'stylesheet'; node.href = url; }
            else { node.src = url; node.async = false; }
            const timeout = setTimeout(() => { node.remove(); reject(new Error('Definition lookup timed out')); }, 12000);
            node.onload = () => { clearTimeout(timeout); resolve(); };
            node.onerror = () => { clearTimeout(timeout); node.remove(); reject(new Error('Definition lookup unavailable')); };
            document.head.append(node);
        });
    }
    document.addEventListener('selectionchange', () => {
        if (window.AlmanionDefinitions || pending) return;
        const selection = window.getSelection();
        const element = selection?.anchorNode?.nodeType === 1 ? selection.anchorNode : selection?.anchorNode?.parentElement;
        const text = selection?.toString().trim();
        if (!text || text.length > 100 || !element?.closest('.main-content') || element.closest('input, textarea, [contenteditable]')) return;
        pending = Promise.all([
            resource('link', 'styles/selection-definitions.css?v=20261004-1'),
            window.AlmanionSafeHtml ? Promise.resolve() : resource('script', 'safe-html.js?v=20261004-1')
        ]).then(() => resource('script', 'selection-definitions.js?v=20261009-3')).catch(() => {
            window.AlmanionToast?.show('Не удалось загрузить поиск определений. Выделите слово ещё раз.', { type: 'error' });
        }).finally(() => { pending = null; });
    });
}

function initCopyableBlocks() {
    const topics = Array.from(document.querySelectorAll('.main-content .topic[id]'));

    if (topics.length && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                observer.unobserve(entry.target);
                addCopyButtons(entry.target);
            });
        }, { rootMargin: '700px 0px' });

        const hashTarget = window.location.hash
            ? document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.closest('.topic[id]')
            : null;
        const initial = hashTarget || topics[0];
        addCopyButtons(initial);
        topics.forEach(topic => {
            if (topic !== initial) observer.observe(topic);
        });

        window.addEventListener('almanion:topic-visible', event => {
            const topic = event.detail?.topic;
            if (topic) {
                observer.unobserve(topic);
                addCopyButtons(topic);
            }
        });
    } else {
        addCopyButtons(document);
    }

    // Один раз вешаем общий обработчик: на touch-устройстве кнопка копирования
    // появляется при касании блока (через класс .is-active) и убирается при касании
    // снаружи. На устройствах с мышью эффект не нужен — CSS показывает по :hover.
    if (!window.__copyTapInit) {
        window.__copyTapInit = true;
        document.addEventListener('click', (e) => {
            // На устройствах с мышью кнопка показывается по :hover — класс is-active
            // не нужен и «залипал» бы видимым после клика в блок. Только для сенсорных.
            if (window.matchMedia && window.matchMedia('(hover: hover)').matches) return;
            const block = e.target.closest('.copyable-block');
            const copyBtn = e.target.closest('.copy-block-btn');
            // Если кликнули по кнопке копирования — состояние блока не трогаем
            if (copyBtn) return;

            // Со всех остальных блоков снимаем активность
            document.querySelectorAll('.copyable-block.is-active').forEach(b => {
                if (b !== block) b.classList.remove('is-active');
            });

            // Активируем именно тот блок, по которому кликнули
            if (block) block.classList.add('is-active');
        });
    }

    // Long press belongs to native text selection. Copying a whole block is an
    // explicit button action, so selecting a word never changes the clipboard.
}

function showCopyToast(text) {
    if (window.AlmanionToast) {
        window.AlmanionToast.show(text, {
            type: /не удалось/i.test(text) ? 'error' : 'success',
            duration: 1800
        });
        return;
    }
    let toast = document.getElementById('copyToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'copyToast';
        toast.className = 'copy-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.classList.add('is-shown');
    clearTimeout(showCopyToast._t);
    showCopyToast._t = setTimeout(() => toast.classList.remove('is-shown'), 1400);
}

function buildWordCopyPayload(sourceBlock) {
    const clone = sourceBlock.cloneNode(true);
    prepareCopyClone(clone);

    const html = `
        <div style="background: transparent; color: #111827; font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.45;">
            ${clone.innerHTML}
        </div>
    `.trim();

    const text = clone.innerText
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return { html, text };
}

function prepareCopyClone(root) {
    root.querySelectorAll('.derivation-content:not(.show), .proof-content:not(.show)').forEach(node => node.remove());
    root.querySelectorAll('.copy-block-btn, .formula-copy-btn, .bookmark-btn, .personal-note-btn, .toggle-derivation, .toggle-proof').forEach(node => node.remove());

    root.querySelectorAll('mark.search-hl, mark.search-hl-active').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });

    root.querySelectorAll('.katex').forEach(katexNode => {
        const annotation = katexNode.querySelector('annotation[encoding="application/x-tex"]');
        if (!annotation) return;

        const tex = annotation.textContent.trim();
        const isDisplay = Boolean(katexNode.closest('.katex-display'));
        const formulaText = isDisplay ? `\\[${tex}\\]` : `\\(${tex}\\)`;
        katexNode.replaceWith(document.createTextNode(formulaText));
    });

    root.querySelectorAll('*').forEach(node => {
        node.removeAttribute('class');
        node.removeAttribute('id');
        node.removeAttribute('style');

        Array.from(node.attributes).forEach(attribute => {
            if (attribute.name.startsWith('data-') || attribute.name.startsWith('aria-')) {
                node.removeAttribute(attribute.name);
            }
        });
    });
}

async function writeRichClipboard(html, text) {
    if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([text], { type: 'text/plain' })
        });
        await navigator.clipboard.write([item]);
        return;
    }

    if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
}

function showCopyState(button, content, className) {
    const previousHTML = button.innerHTML;
    button.innerHTML = content;
    button.classList.add(className);

    setTimeout(() => {
        button.innerHTML = previousHTML;
        button.classList.remove(className);
    }, 1400);
}

// ============================================
// СОХРАНЕНИЕ ПОЗИЦИИ СКРОЛЛА
// ============================================

window.addEventListener('pagehide', () => {
    const key = 'scrollPosition_' + location.pathname;
    _safeSet(key, window.pageYOffset);
});

window.addEventListener('load', () => {
    // Let fragment links and the browser's Back/Forward restoration take precedence.
    if (location.hash || window.scrollY || performance.getEntriesByType('navigation')[0]?.type === 'back_forward') return;
    const key = 'scrollPosition_' + location.pathname;
    const savedPosition = _safeGet(key);
    if (savedPosition) {
        const n = parseInt(savedPosition, 10);
        if (Number.isFinite(n)) window.scrollTo(0, n);
    }
});

console.log('✅ Сайт конспектов загружен успешно!');
console.log('💡 Горячие клавиши:');
console.log('   • Ctrl/Cmd + K - Поиск');
console.log('   • Escape - Закрыть меню');
console.log('   • [ - Свернуть/развернуть боковое меню');

// ============================================
// Нижняя навигация (нативный мобильный экспериментальный дизайн).
// Видна только при body.experimental на телефоне (управляется CSS).
// ============================================
function openReaderSearch(opener) {
    const input = document.getElementById('searchInput');
    const box = input?.closest('.search-box');
    if (!box) return;
    if (box.closest('dialog[open]')) { input.focus(); return; }
    const sidebar = box.closest('#sidebar');
    if (!sidebar) return;
    const trigger = opener?.getClientRects().length && !sidebar.contains(opener) ? opener : mobileMenuButton();
    if (sidebar.classList.contains('open')) closeMobileMenu(false);
    const place = document.createComment('reader search');
    box.before(place);
    const dialog = document.createElement('dialog');
    dialog.id = 'readerSearchDialog';
    dialog.className = 'reader-search-dialog';
    dialog.setAttribute('aria-label', 'Поиск по конспекту');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'reader-search-dismiss';
    close.textContent = 'Закрыть';
    close.addEventListener('click', () => dialog.close());
    dialog.append(box, close);
    const results = document.getElementById('searchResultsPanel');
    if (results) dialog.append(results);
    document.body.append(dialog);
    const viewport = window.visualViewport;
    const size = () => dialog.style.setProperty('--search-viewport', (viewport?.height || innerHeight) + 'px');
    const phone = matchMedia('(max-width: 768px)');
    const resized = () => { if (!phone.matches && dialog.open) dialog.close(); };
    size();
    viewport?.addEventListener('resize', size);
    phone.addEventListener('change', resized);
    dialog.addEventListener('click', event => {
        if (event.target === dialog && !box.contains(event.target)) {
            const rect = dialog.getBoundingClientRect();
            if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) dialog.close();
        }
    });
    dialog.addEventListener('close', () => {
        viewport?.removeEventListener('resize', size);
        phone.removeEventListener('change', resized);
        const panel = dialog.querySelector('#searchResultsPanel');
        window.AlmanionSearch?.close?.();
        input.value = '';
        place.replaceWith(box);
        if (panel) box.after(panel);
        dialog.remove();
        if (trigger?.getAttribute('aria-controls') === dialog.id) trigger.setAttribute('aria-expanded', 'false');
        if (trigger?.getClientRects().length) trigger.focus({ preventScroll: true });
        else if (!sidebar.inert) input.focus({ preventScroll: true });
    }, { once: true });
    dialog.showModal();
    if (trigger?.getAttribute('aria-controls') === dialog.id) trigger.setAttribute('aria-expanded', 'true');
    input.focus({ preventScroll: true });
}

function initExpBottomNav() {
    if (document.getElementById('expBottomNav')) return;
    if (!document.getElementById('sidebar')) return; // только страницы с меню
    const isMatcenter = document.body.classList.contains('matcenter-page');

    const ICONS = {
        menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
        bm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
        kc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>',
        acc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    };

    function clickById(id) { const el = document.getElementById(id); if (el) el.click(); }
    function openBookmarks() {
        if (window.AlmanionBookmarks && typeof window.AlmanionBookmarks.open === 'function') {
            window.AlmanionBookmarks.open();
            return;
        }
        if (window.AlmanionNoteRuntime && typeof window.AlmanionNoteRuntime.ensure === 'function') {
            window.AlmanionNoteRuntime.ensure('bookmarks').then(function () {
                if (window.AlmanionBookmarks && typeof window.AlmanionBookmarks.open === 'function') {
                    window.AlmanionBookmarks.open();
                } else {
                    clickById('bookmarksBtn');
                }
            }).catch(function () {});
            return;
        }
        clickById('bookmarksBtn');
    }
    function toggleMenu(event) {
        const sb = document.getElementById('sidebar');
        if (sb && sb.classList.contains('open')) { if (window.closeMobileMenu) window.closeMobileMenu(); }
        else if (window.openMobileMenu) window.openMobileMenu(event.currentTarget);
    }
    function openSearch(event) {
        if (document.body.classList.contains('matcenter-page')) {
            const mobileInput = document.getElementById('mobileSearchInput') || document.getElementById('searchInput');
            if (mobileInput) {
                mobileInput.focus({ preventScroll: false });
                mobileInput.scrollIntoView({ block: 'center', behavior: 'smooth' });
                return;
            }
        }
        openReaderSearch(event.currentTarget);
    }

    const items = [
        { label: 'Меню', icon: ICONS.menu, act: toggleMenu },
        { label: 'Поиск', icon: ICONS.search, act: openSearch }
    ];
    if (!isMatcenter) {
        items.push({ label: 'Закладки', icon: ICONS.bm, act: openBookmarks });
        const hasKnowledgeCards = !!document.querySelector(
            '.definition-box, .formula-box, .derivation-box, .remark-box, .theorem-box, ' +
            '.lemma-box, .statement-box, .corollary-box, .properties-box, .proof-box, ' +
            '.experiment-box, .example-box, .accent-word-card, article.topic table'
        );
        if (hasKnowledgeCards || document.getElementById('knowledgeCheckBtn')) {
            items.push({ label: 'Учить', icon: ICONS.kc, act: function (event) {
                if (window.AlmanionNoteRuntime) window.AlmanionNoteRuntime.openLearning(event.currentTarget);
                else clickById('knowledgeCheckBtn');
            } });
        }
    }
    items.push({ label: 'Аккаунт', icon: ICONS.acc, act: function () { clickById('accountBtn'); } });

    const nav = document.createElement('nav');
    nav.id = 'expBottomNav';
    nav.className = 'exp-bottom-nav';
    nav.setAttribute('aria-label', 'Быстрая навигация');
    items.forEach(function (it) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'exp-bn-item';
        b.setAttribute('aria-label', it.label);
        if (it.label === 'Учить') b.setAttribute('aria-haspopup', 'dialog');
        if (it.act === openSearch && !isMatcenter) {
            b.setAttribute('aria-haspopup', 'dialog');
            b.setAttribute('aria-controls', 'readerSearchDialog');
            b.setAttribute('aria-expanded', 'false');
        }
        if (it.act === toggleMenu) {
            b.setAttribute('aria-controls', 'sidebar');
            b.setAttribute('aria-expanded', 'false');
        }
        b.innerHTML = it.icon + '<span class="exp-bn-label">' + it.label + '</span>';
        // Останавливаем всплытие: иначе глобальный «клик вне меню → закрыть»
        // тут же закроет только что открытое меню.
        b.addEventListener('click', function (e) { e.stopPropagation(); it.act(e); });
        nav.appendChild(b);
    });
    document.body.appendChild(nav);
    const input = document.querySelector('#sidebar #searchInput');
    if (!isMatcenter && input) input.addEventListener('focus', () => {
        if (window.innerWidth <= 768 && input.closest('#sidebar.open')) openReaderSearch();
    });
}
document.addEventListener('DOMContentLoaded', initExpBottomNav);

// Load the shared image viewer on first use.
(function () {
    const diagrams = 'figure svg[viewBox][role="img"], .chem-note-table svg[viewBox], .kc-table-answer svg[role="img"]';
    const selector = 'img, ' + diagrams;
    let loading;
    function open(event) {
        const source = event.target.closest?.(selector);
        if (!source || !source.closest('.main-content, .kc-definition, .kc-prompt-media, .bm-card-content')) return;
        if (event.type === 'keydown' && (!['Enter', ' '].includes(event.key) ||
            (source.localName !== 'svg' && !source.closest('.kc-prompt-media')))) return;
        event.preventDefault();
        event.stopPropagation();
        if (window.AlmanionImageViewer) return window.AlmanionImageViewer.open(source);
        if (!loading) loading = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'note-image-viewer.js?v=1';
            script.onload = resolve;
            script.onerror = () => { script.remove(); loading = null; reject(); };
            document.head.append(script);
        });
        loading.then(() => window.AlmanionImageViewer.open(source), () => window.AlmanionToast?.show('Не удалось открыть иллюстрацию. Попробуйте ещё раз.'));
    }
    document.querySelectorAll(diagrams).forEach(svg => {
        svg.setAttribute('tabindex', '0');
        svg.setAttribute('aria-haspopup', 'dialog');
    });
    document.addEventListener('click', open, true);
    document.addEventListener('keydown', open, true);
})();

// ============================================
// Индикатор прогресса чтения — тонкая полоса сверху (только на страницах конспектов)
// ============================================
(function () {
    function init() {
        const main = document.querySelector('.main-content');
        const hasTopics = document.querySelector('.topic, .topic-title');
        if (!main || !hasTopics) return;
        const bar = document.createElement('div');
        bar.id = 'readingProgress';
        bar.innerHTML = '<div class="rp-fill"></div>';
        document.body.appendChild(bar);
        const fill = bar.querySelector('.rp-fill');
        let ticking = false;
        function update() {
            const doc = document.documentElement;
            const scrollTop = window.pageYOffset || doc.scrollTop || 0;
            const height = doc.scrollHeight - doc.clientHeight;
            const pct = height > 0 ? Math.min(1, Math.max(0, scrollTop / height)) : 0;
            fill.style.transform = 'scaleX(' + pct + ')';
            bar.classList.toggle('rp-visible', scrollTop > 40);
            ticking = false;
        }
        function onScroll() {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
        }
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        update();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
