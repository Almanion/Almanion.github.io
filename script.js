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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/docs/sw.js').catch(() => {});
}

// Guard от двойной инициализации — DOMContentLoaded может прилететь дважды
// при некоторых редких сценариях (SPA-навигация, перерегистрация SW и т.п.).
let __initDone = false;
document.addEventListener('DOMContentLoaded', () => {
    if (__initDone) return;
    __initDone = true;

    initMath();
    initNavigation();
    initSearch();
    initScrollEffects();
    initDerivationToggles();
    initProofToggles();
    initMobileMenu();
    initBottomSheetSwipe();
    initSidebarCollapse();
    initCopyableBlocks();
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
    const katexOptions = {
        delimiters: [
            {left: '\\[', right: '\\]', display: true},
            {left: '\\(', right: '\\)', display: false},
            {left: '$', right: '$', display: false}
        ],
        throwOnError: false,
        trust: true
    };

    // Если на странице нет ни одного math-блока — KaTeX не нужен, не дёргаем CDN.
    // (index.html и admin.html не имеют формул — нет смысла ждать загрузки 15 секунд.)
    const hasMathContent = !!document.querySelector(
        '.formula-box, .derivation-content, .proof-content, .definition-box, ' +
        '.theorem-box, .lemma-box, .statement-box, .corollary-box, .system-box, ' +
        '.derivation-box, .proof-box, .topic, .content-section'
    );
    if (!hasMathContent) return;

    // Помечаем уже отрендеренные derivation/proof, чтобы при тогле не вызывать KaTeX второй раз
    function markRenderedBlocks() {
        document.querySelectorAll('.derivation-content, .proof-content').forEach(el => {
            el.dataset.latexRendered = '1';
        });
    }

    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(document.body, katexOptions);
        markRenderedBlocks();
        return;
    }

    // KaTeX ещё не загружен (медленный CDN на мобильных) — ждём
    let attempts = 0;
    const maxAttempts = 30; // до 15 секунд

    const waitForKaTeX = setInterval(() => {
        attempts++;
        if (typeof renderMathInElement !== 'undefined') {
            clearInterval(waitForKaTeX);
            renderMathInElement(document.body, katexOptions);
            markRenderedBlocks();
        } else if (attempts >= maxAttempts) {
            clearInterval(waitForKaTeX);
            console.warn('⚠️ KaTeX не удалось загрузить за 15 секунд');
        }
    }, 500);
}

// ============================================
// НАВИГАЦИЯ
// ============================================

function initNavigation() {
    // На Матцентре своя навигация в matcenter.js
    if (document.body.classList.contains('matcenter-page')) return;

    const navLinks = document.querySelectorAll('.nav-link');
    // Поддерживаем оба варианта: .topic и .content-section
    const topics = document.querySelectorAll('.topic, .content-section');
    const navGroupToggles = document.querySelectorAll('.nav-group-toggle');
    
    // Раскрываем все группы по умолчанию
    document.querySelectorAll('.nav-group').forEach(group => {
        group.classList.add('open');
    });
    
    // Обработка кликов по кнопкам раскрытия групп
    navGroupToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const navGroup = toggle.closest('.nav-group');
            navGroup.classList.toggle('open');
        });
    });
    
    // Клик по ссылке навигации
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                closeMobileMenu();

                const stickyHeader = document.querySelector('.topic-title');
                const headerHeight = stickyHeader ? stickyHeader.offsetHeight + 8 : 20;
                const offset = window.innerWidth <= 768 ? headerHeight : 20;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });

                targetElement.classList.add('nav-highlight');
                setTimeout(() => targetElement.classList.remove('nav-highlight'), 1500);
            }
        });
    });
    
    // Автоматическое выделение активной секции через IntersectionObserver
    let currentSection = '';
    
    function setActiveLink(sectionId) {
        if (currentSection === sectionId) return;
        currentSection = sectionId;
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            
            if (link.getAttribute('href') === `#${sectionId}`) {
                link.classList.add('active');
                
                // Автоматически раскрываем группу навигации с активной ссылкой
                const parentGroup = link.closest('.nav-group');
                if (parentGroup && !parentGroup.classList.contains('open')) {
                    parentGroup.classList.add('open');
                }
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
// ПОИСК (Ctrl+F стиль)
// ============================================

const searchState = {
    matches: [],
    currentIndex: -1,
    term: '',
    bar: null,
    debounce: null,
    active: false
};

function initSearch() {
    // На Матцентре используется отдельный поиск в matcenter.js.
    // Здесь отключаем общий полнотекстовый поиск, чтобы не было конфликта обработчиков.
    if (document.body.classList.contains('matcenter-page')) return;

    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    createSearchBar();

    searchInput.addEventListener('input', () => {
        if (searchState.debounce) clearTimeout(searchState.debounce);
        const term = searchInput.value.trim();
        if (term.length < 2) {
            clearSearch();
            return;
        }
        searchState.debounce = setTimeout(() => {
            performSearch(term.toLowerCase());
        }, 300);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchState.matches.length > 0) {
            e.preventDefault();
            closeMobileMenu();
            navigateMatch(e.shiftKey ? -1 : 1);
        }
    });
}

function createSearchBar() {
    if (document.getElementById('searchNavBar')) return;
    const bar = document.createElement('div');
    bar.id = 'searchNavBar';
    bar.className = 'search-nav-bar hidden';
    bar.innerHTML =
        '<span class="search-nav-count"></span>' +
        '<div class="search-nav-sections"></div>' +
        '<div class="search-nav-controls">' +
            '<button class="search-nav-btn" id="searchPrev" aria-label="Предыдущее">▲</button>' +
            '<button class="search-nav-btn" id="searchNext" aria-label="Следующее">▼</button>' +
            '<button class="search-nav-btn search-nav-close" id="searchClose" aria-label="Закрыть"><span class="eic eic-x" aria-hidden="true"></span></button>' +
        '</div>';
    document.body.appendChild(bar);
    searchState.bar = bar;

    bar.querySelector('#searchPrev').addEventListener('click', () => navigateMatch(-1));
    bar.querySelector('#searchNext').addEventListener('click', () => navigateMatch(1));
    bar.querySelector('#searchClose').addEventListener('click', () => {
        const input = document.getElementById('searchInput');
        if (input) input.value = '';
        clearSearch();
    });
}

function performSearch(term) {
    clearHighlights();
    searchState.matches = [];
    searchState.currentIndex = -1;
    searchState.term = term;
    searchState.active = true;

    const root = document.querySelector('.main-content') || document.body;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            if (p.closest('.katex, .sidebar, .search-nav-bar, script, style, noscript')) {
                return NodeFilter.FILTER_REJECT;
            }
            if (node.textContent.toLowerCase().indexOf(term) === -1) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach(node => {
        const text = node.textContent;
        const lower = text.toLowerCase();
        const parent = node.parentNode;
        if (!parent) return;

        const frag = document.createDocumentFragment();
        let pos = 0;
        let idx;
        while ((idx = lower.indexOf(term, pos)) !== -1) {
            if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
            const mark = document.createElement('mark');
            mark.className = 'search-hl';
            mark.textContent = text.slice(idx, idx + term.length);
            searchState.matches.push(mark);
            frag.appendChild(mark);
            pos = idx + term.length;
        }
        if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
        parent.replaceChild(frag, node);
    });

    showSearchBar();

    if (searchState.matches.length > 0) {
        searchState.currentIndex = 0;
        searchState.matches[0].classList.add('search-hl-active');
    }
}

function navigateMatch(dir) {
    const m = searchState.matches;
    if (!m.length) return;
    m[searchState.currentIndex]?.classList.remove('search-hl-active');
    searchState.currentIndex = (searchState.currentIndex + dir + m.length) % m.length;
    const el = m[searchState.currentIndex];
    el.classList.add('search-hl-active');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    showSearchBar();
}

function showSearchBar() {
    const bar = searchState.bar;
    if (!bar) return;
    const total = searchState.matches.length;
    const countEl = bar.querySelector('.search-nav-count');
    const secEl = bar.querySelector('.search-nav-sections');

    if (total === 0) {
        bar.classList.remove('hidden');
        countEl.textContent = searchState.term ? 'Ничего не найдено' : '';
        secEl.innerHTML = '';
        return;
    }

    bar.classList.remove('hidden');
    countEl.textContent = (searchState.currentIndex + 1) + ' / ' + total;

    const map = new Map();
    searchState.matches.forEach((el, i) => {
        const sec = el.closest('.topic, .content-section');
        if (!sec) return;
        if (!map.has(sec)) {
            const tEl = sec.querySelector('.topic-title, h3');
            let name = '';
            if (tEl) {
                tEl.childNodes.forEach(n => {
                    if (n.nodeType === Node.TEXT_NODE) name += n.textContent;
                });
                name = name.trim() || tEl.textContent.trim();
            }
            if (!name) name = sec.id || '?';
            map.set(sec, { name, count: 0, first: i });
        }
        map.get(sec).count++;
    });

    let html = '';
    map.forEach((info) => {
        const cur = searchState.currentIndex;
        const active = cur >= info.first && cur < info.first + info.count;
        html += '<button class="search-nav-section' + (active ? ' active' : '') +
            '" data-i="' + info.first + '">' +
            escapeSearchHtml(info.name) +
            ' <span class="search-section-badge">' + info.count + '</span></button>';
    });
    secEl.innerHTML = html;

    secEl.querySelectorAll('.search-nav-section').forEach(btn => {
        btn.addEventListener('click', () => {
            const i = parseInt(btn.dataset.i);
            searchState.matches[searchState.currentIndex]?.classList.remove('search-hl-active');
            searchState.currentIndex = i;
            searchState.matches[i].classList.add('search-hl-active');
            searchState.matches[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
            closeMobileMenu();
            showSearchBar();
        });
    });
}

function escapeSearchHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function clearSearch() {
    clearHighlights();
    searchState.matches = [];
    searchState.currentIndex = -1;
    searchState.term = '';
    searchState.active = false;
    if (searchState.bar) searchState.bar.classList.add('hidden');
}

function clearHighlights() {
    document.querySelectorAll('mark.search-hl').forEach(mark => {
        const parent = mark.parentNode;
        if (!parent) return;
        mark.replaceWith(document.createTextNode(mark.textContent));
        parent.normalize();
    });
}

function removeHighlights(element) {
    if (!element) return;
    element.querySelectorAll('mark.search-hl').forEach(mark => {
        mark.replaceWith(document.createTextNode(mark.textContent));
    });
    element.normalize();
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
    
    // Плавное появление элементов
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in', 'visible');
            }
        });
    }, observerOptions);
    
    // Поддерживаем оба варианта: .topic и .content-section
    const topics = document.querySelectorAll('.topic, .content-section');
    topics.forEach(topic => {
        topic.classList.add('fade-in');
        observer.observe(topic);
    });
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
    throwOnError: false,
    trust: true
};

// Рендерим формулы один раз на элемент, помечая флагом.
function renderMathOnce(el) {
    if (!el || typeof renderMathInElement === 'undefined') return;
    if (el.dataset.latexRendered === '1') return;
    renderMathInElement(el, KATEX_OPTIONS);
    el.dataset.latexRendered = '1';
}

function setToggleLabel(button, text) {
    button.innerHTML = TOGGLE_BOOK_ICON + '<span>' + text + '</span>';
}

function initDerivationToggles() {
    const toggleButtons = document.querySelectorAll('.toggle-derivation');

    toggleButtons.forEach(button => {
        const derivationContent = button.nextElementSibling;

        // Показываем все выводы по умолчанию
        if (derivationContent && derivationContent.classList.contains('derivation-content')) {
            derivationContent.classList.add('show');
            setToggleLabel(button, 'Скрыть вывод формулы');
        }

        button.addEventListener('click', () => {
            if (!derivationContent || !derivationContent.classList.contains('derivation-content')) return;
            const shown = derivationContent.classList.toggle('show');
            setToggleLabel(button, shown ? 'Скрыть вывод формулы' : 'Показать вывод формулы');
            if (shown) renderMathOnce(derivationContent);
        });
    });
}

// ============================================
// TOGGLE ДОКАЗАТЕЛЬСТВ
// ============================================

function initProofToggles() {
    const toggleButtons = document.querySelectorAll('.toggle-proof');

    toggleButtons.forEach(button => {
        const proofContent = button.nextElementSibling;
        // Изначальное состояние кнопки определяет текущий текст
        const initiallyOpen = proofContent && proofContent.classList.contains('show');
        if (!button.innerHTML.includes('toggle-book-icon')) {
            setToggleLabel(button, initiallyOpen ? 'Скрыть доказательство' : 'Показать доказательство');
        }

        button.addEventListener('click', () => {
            if (!proofContent || !proofContent.classList.contains('proof-content')) return;
            const shown = proofContent.classList.toggle('show');
            setToggleLabel(button, shown ? 'Скрыть доказательство' : 'Показать доказательство');
            if (shown) renderMathOnce(proofContent);
        });
    });
}

// ============================================
// МОБИЛЬНОЕ МЕНЮ
// ============================================

function initMobileMenu() {
    // Guard: вешаем document.click только один раз. При повторных вызовах
    // не будем устраивать дубли обработчиков (которые приводили к "двойному закрытию").
    if (window.__mobileMenuInit) return;

    const menuToggle = document.getElementById('menuToggle');
    const closeSidebar = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');

    // На страницах без сайдбара (index.html, the-secret-game.html) — тихо выходим.
    // Не warning'уем — это нормальное состояние.
    if (!menuToggle || !closeSidebar || !sidebar) {
        return;
    }
    window.__mobileMenuInit = true;
    
    // Создаём оверлей, если его ещё нет
    let overlay = document.querySelector('.sidebar-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);
    }
    
    menuToggle.addEventListener('click', () => {
        openMobileMenu();
    });
    
    closeSidebar.addEventListener('click', () => {
        closeMobileMenu();
    });
    
    // Поддержка touchend для надёжного закрытия на мобильных
    closeSidebar.addEventListener('touchend', (e) => {
        e.preventDefault();
        closeMobileMenu();
    });
    
    // Закрытие при клике/тапе на оверлей
    overlay.addEventListener('click', () => {
        closeMobileMenu();
    });
    overlay.addEventListener('touchend', (e) => {
        e.preventDefault();
        closeMobileMenu();
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

function openMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    sidebar.classList.add('open');
    sidebar.classList.remove('collapsed');
    sidebar.style.transform = '';
    if (overlay) {
        overlay.classList.add('active');
    }
    
    if (window.innerWidth <= 768) {
        document.body.classList.add('sidebar-open');
    }
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar) {
        sidebar.classList.remove('open');
        sidebar.style.transform = '';
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
    
    document.body.classList.remove('sidebar-open');
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
        if (sidebar.scrollTop > 5) return;
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
            // Вставляем перед кнопкой закрытия
            const closeBtn = sidebarHeader.querySelector('.close-sidebar');
            if (closeBtn) {
                sidebarHeader.insertBefore(collapseBtn, closeBtn);
            } else {
                sidebarHeader.appendChild(collapseBtn);
            }
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
    const isCollapsed = _safeGet('sidebarCollapsed') === 'true';
    if (isCollapsed && window.innerWidth > 768) {
        sidebar.classList.add('collapsed');
        document.body.classList.add('sidebar-collapsed');
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
    _safeSet('sidebarCollapsed', 'true');
}

function expandSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    sidebar.classList.remove('collapsed');
    document.body.classList.remove('sidebar-collapsed');
    _safeSet('sidebarCollapsed', 'false');
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
    '.topic',
    '.definition-box',
    '.formula-box',
    '.remark-box',
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

function initCopyableBlocks() {
    document.querySelectorAll(COPYABLE_BLOCK_SELECTOR).forEach(block => {
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

            try {
                const payload = buildWordCopyPayload(block);
                await writeRichClipboard(payload.html, payload.text);
                showCopyState(copyBtn, COPY_ICONS.check, 'is-copied');
            } catch (error) {
                console.error('Ошибка копирования блока:', error);
                showCopyState(copyBtn, COPY_ICONS.cross, 'is-error');
            }
        });

        block.appendChild(copyBtn);
    });

    // Один раз вешаем общий обработчик: на touch-устройстве кнопка копирования
    // появляется при касании блока (через класс .is-active) и убирается при касании
    // снаружи. На устройствах с мышью эффект не нужен — CSS показывает по :hover.
    if (!window.__copyTapInit) {
        window.__copyTapInit = true;
        document.addEventListener('click', (e) => {
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

    // На сенсорных устройствах кнопка копирования скрыта (CSS) — блок копируется
    // ДОЛГИМ НАЖАТИЕМ (удержанием, а не прокруткой). Прокрутка отменяет жест.
    // Само копирование делаем на touchend: там есть «жест пользователя», без которого
    // Clipboard API не сработает (из setTimeout он бы упал). На 500 мс — вибро-подтверждение.
    if (!window.__copyLongPressInit) {
        window.__copyLongPressInit = true;
        let lpTimer = null, lpX = 0, lpY = 0, lpReady = false, lpBlock = null;
        const reset = () => {
            if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
            if (lpBlock) lpBlock.classList.remove('is-longpressing');
            lpReady = false; lpBlock = null;
        };
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const block = e.target.closest('.copyable-block');
            if (!block) return;
            if (e.target.closest('a, button, input, textarea, .bookmark-btn, .copy-block-btn')) return;
            reset();
            lpBlock = block;
            lpX = e.touches[0].clientX; lpY = e.touches[0].clientY;
            lpTimer = setTimeout(() => {
                lpTimer = null; lpReady = true;
                if (lpBlock) lpBlock.classList.add('is-longpressing');
                if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
            }, 500);
        }, { passive: true });
        document.addEventListener('touchmove', (e) => {
            if (!lpBlock) return;
            const t = e.touches[0];
            if (Math.abs(t.clientX - lpX) > 10 || Math.abs(t.clientY - lpY) > 10) reset(); // прокрутка — отмена
        }, { passive: true });
        document.addEventListener('touchend', () => {
            const block = lpBlock, ready = lpReady;
            reset();
            if (ready && block) longPressCopyBlock(block); // touchend = валидный жест → буфер доступен
        });
        document.addEventListener('touchcancel', reset);
    }
}

async function longPressCopyBlock(block) {
    try {
        const payload = buildWordCopyPayload(block);
        await writeRichClipboard(payload.html, payload.text);
        block.classList.add('is-longcopied');
        setTimeout(() => block.classList.remove('is-longcopied'), 600);
        showCopyToast('Скопировано');
        if (navigator.vibrate) { try { navigator.vibrate(20); } catch (_) {} }
    } catch (error) {
        showCopyToast('Не удалось скопировать');
    }
}

function showCopyToast(text) {
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
    root.querySelectorAll('.copy-block-btn, .formula-copy-btn, .bookmark-btn, .toggle-derivation, .toggle-proof').forEach(node => node.remove());

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
// ЭКСПОРТ В PDF (опционально)
// ============================================

function exportToPDF() {
    document.querySelectorAll('.derivation-content').forEach(el => {
        el.style.display = 'block';
        el.style.maxHeight = 'none';
    });

    document.querySelectorAll('.toggle-derivation').forEach(el => {
        el.style.display = 'none';
    });

    setTimeout(() => window.print(), 200);

    window.addEventListener('afterprint', function restoreUI() {
        document.querySelectorAll('.derivation-content').forEach(el => {
            el.style.display = '';
            el.style.maxHeight = '';
        });
        document.querySelectorAll('.toggle-derivation').forEach(el => {
            el.style.display = '';
        });
        window.removeEventListener('afterprint', restoreUI);
    });
}

// Добавляем кнопку экспорта в футер
const footer = document.querySelector('.page-footer');
if (footer) {
    const exportBtn = document.createElement('button');
    exportBtn.innerHTML = '<span class="eic eic-file" aria-hidden="true"></span> Экспорт в PDF';
    exportBtn.style.cssText = `
        margin-top: 1rem;
        padding: 0.75rem 1.5rem;
        background: var(--accent-color);
        color: white;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 1rem;
        font-weight: 500;
        transition: var(--transition);
    `;
    exportBtn.addEventListener('click', exportToPDF);
    footer.insertBefore(exportBtn, footer.firstChild);
}

// ============================================
// СТАТИСТИКА ПРОГРЕССА (опционально)
// ============================================

// Создаём прогресс-бар один раз при загрузке
let progressBarElement = null;

function initProgressBar() {
    if (!progressBarElement) {
        progressBarElement = document.createElement('div');
        progressBarElement.id = 'progressBar';
        progressBarElement.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 0%;
            height: 4px;
            background: var(--accent-color);
            z-index: 9999;
            transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        `;
        document.body.appendChild(progressBarElement);
    }
}

function updateProgress() {
    if (!progressBarElement) {
        initProgressBar();
    }
    
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    // Предотвращаем деление на ноль
    const progress = documentHeight > windowHeight 
        ? Math.min(100, (scrollTop / (documentHeight - windowHeight)) * 100)
        : 0;
    
    progressBarElement.style.width = Math.round(progress) + '%';
}

// Дебаунс для оптимизации производительности
let progressTimeout;
function debouncedUpdateProgress() {
    if (progressTimeout) {
        cancelAnimationFrame(progressTimeout);
    }
    progressTimeout = requestAnimationFrame(updateProgress);
}

window.addEventListener('scroll', debouncedUpdateProgress, { passive: true });
initProgressBar();
updateProgress();

// ============================================
// СОХРАНЕНИЕ ПОЗИЦИИ СКРОЛЛА
// ============================================

window.addEventListener('beforeunload', () => {
    const key = 'scrollPosition_' + location.pathname;
    _safeSet(key, window.pageYOffset);
});

window.addEventListener('load', () => {
    const key = 'scrollPosition_' + location.pathname;
    const savedPosition = _safeGet(key);
    if (savedPosition) {
        const n = parseInt(savedPosition, 10);
        if (Number.isFinite(n)) window.scrollTo(0, n);
    }
});

// ============================================
// АНИМАЦИЯ ПРИ ЗАГРУЗКЕ
// ============================================

// Убираем потенциальное мерцание - устанавливаем opacity только если он не был установлен
window.addEventListener('load', () => {
    if (!document.body.style.opacity) {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
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
function initExpBottomNav() {
    if (document.getElementById('expBottomNav')) return;
    if (!document.getElementById('sidebar')) return; // только страницы с меню

    const ICONS = {
        menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
        bm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
        kc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/></svg>',
        acc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
    };

    function clickById(id) { const el = document.getElementById(id); if (el) el.click(); }
    function toggleMenu() {
        const sb = document.getElementById('sidebar');
        if (sb && sb.classList.contains('open')) { if (window.closeMobileMenu) window.closeMobileMenu(); }
        else if (window.openMobileMenu) window.openMobileMenu();
    }
    function openSearch() {
        if (window.openMobileMenu) window.openMobileMenu();
        setTimeout(function () {
            const s = document.getElementById('searchInput');
            if (s) { s.scrollIntoView({ block: 'center' }); s.focus(); }
        }, 90);
    }

    const items = [
        { label: 'Меню', icon: ICONS.menu, act: toggleMenu },
        { label: 'Поиск', icon: ICONS.search, act: openSearch },
        { label: 'Закладки', icon: ICONS.bm, act: function () { clickById('bookmarksBtn'); } },
        { label: 'Знания', icon: ICONS.kc, act: function () { clickById('knowledgeCheckBtn'); } },
        { label: 'Аккаунт', icon: ICONS.acc, act: function () { clickById('accountBtn'); } }
    ];

    const nav = document.createElement('nav');
    nav.id = 'expBottomNav';
    nav.className = 'exp-bottom-nav';
    nav.setAttribute('aria-label', 'Быстрая навигация');
    items.forEach(function (it) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'exp-bn-item';
        b.setAttribute('aria-label', it.label);
        b.innerHTML = it.icon + '<span class="exp-bn-label">' + it.label + '</span>';
        // Останавливаем всплытие: иначе глобальный «клик вне меню → закрыть»
        // тут же закроет только что открытое меню.
        b.addEventListener('click', function (e) { e.stopPropagation(); it.act(e); });
        nav.appendChild(b);
    });
    document.body.appendChild(nav);
}
document.addEventListener('DOMContentLoaded', initExpBottomNav);