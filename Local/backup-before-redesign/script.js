// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/docs/sw.js').catch(() => {});
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMath();
    initNavigation();
    initSearch();
    initScrollEffects();
    initDerivationToggles();
    initProofToggles();
    initMobileMenu();
    initBottomSheetSwipe();
    initSidebarCollapse();
});

// ============================================
// ПЕРЕКЛЮЧЕНИЕ ТЕМЫ
// ============================================

function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    
    // Проверяем сохранённую тему в localStorage
    const savedTheme = localStorage.getItem('theme');
    
    // Применяем сохранённую тему или используем светлую по умолчанию
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        if (themeToggle) {
            themeToggle.textContent = '☀️';
        }
    } else {
        document.body.classList.remove('dark-theme');
        if (themeToggle) {
            themeToggle.textContent = '🌙';
        }
    }
    
    // Обработчик клика на кнопку переключения темы
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-theme');
            
            // Сохраняем выбранную тему в localStorage
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            
            // Меняем иконку кнопки
            themeToggle.textContent = isDark ? '☀️' : '🌙';
            
            // Добавляем небольшую анимацию
            themeToggle.style.transform = 'scale(0.9)';
            setTimeout(() => {
                themeToggle.style.transform = '';
            }, 150);
        });
    }
}


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

    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(document.body, katexOptions);
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
            console.log('📐 KaTeX загружен (попытка ' + attempts + ')');
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
            '<button class="search-nav-btn search-nav-close" id="searchClose" aria-label="Закрыть">✕</button>' +
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

function initDerivationToggles() {
    const toggleButtons = document.querySelectorAll('.toggle-derivation');
    
    toggleButtons.forEach(button => {
        const derivationContent = button.nextElementSibling;
        
        // Показываем все выводы по умолчанию
        if (derivationContent && derivationContent.classList.contains('derivation-content')) {
            derivationContent.classList.add('show');
            button.textContent = '📖 Скрыть вывод формулы';
        }
        
        button.addEventListener('click', () => {
            if (derivationContent && derivationContent.classList.contains('derivation-content')) {
                derivationContent.classList.toggle('show');
                
                // Меняем текст кнопки
                if (derivationContent.classList.contains('show')) {
                    button.textContent = '📖 Скрыть вывод формулы';
                } else {
                    button.textContent = '📖 Показать вывод формулы';
                }
                
                // Рендерим формулы в выводе, если они ещё не отрендерены
                if (derivationContent.classList.contains('show') && typeof renderMathInElement !== 'undefined') {
                    renderMathInElement(derivationContent, {
                        delimiters: [
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '$', right: '$', display: false}
                        ],
                        throwOnError: false,
                        trust: true
                    });
                }
            }
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
        
        button.addEventListener('click', () => {
            if (proofContent && proofContent.classList.contains('proof-content')) {
                proofContent.classList.toggle('show');
                
                if (proofContent.classList.contains('show')) {
                    button.textContent = '📖 Скрыть доказательство';
                } else {
                    button.textContent = '📖 Показать доказательство';
                }
                
                if (proofContent.classList.contains('show') && typeof renderMathInElement !== 'undefined') {
                    renderMathInElement(proofContent, {
                        delimiters: [
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '$', right: '$', display: false}
                        ],
                        throwOnError: false,
                        trust: true
                    });
                }
            }
        });
    });
}

// ============================================
// МОБИЛЬНОЕ МЕНЮ
// ============================================

function initMobileMenu() {
    const menuToggle = document.getElementById('menuToggle');
    const closeSidebar = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');
    
    // Проверяем наличие элементов
    if (!menuToggle || !closeSidebar || !sidebar) {
        console.warn('⚠️ Не найдены элементы мобильного меню');
        return;
    }
    
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
        collapseBtn.textContent = '←';
        
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
        expandBtn.textContent = '☰';
        document.body.appendChild(expandBtn);
    }
    
    // Восстанавливаем состояние из localStorage
    const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
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
    localStorage.setItem('sidebarCollapsed', 'true');
}

function expandSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    sidebar.classList.remove('collapsed');
    document.body.classList.remove('sidebar-collapsed');
    localStorage.setItem('sidebarCollapsed', 'false');
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
// КОПИРОВАНИЕ ФОРМУЛ
// ============================================

document.querySelectorAll('.formula-box').forEach(formulaBox => {
    formulaBox.style.position = 'relative';
    
    // Сохраняем исходный LaTeX код до рендеринга KaTeX
    const originalHTML = formulaBox.innerHTML;
    let latexCode = '';
    
    // Извлекаем LaTeX код из исходного HTML
    const latexBlocks = originalHTML.match(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g);
    if (latexBlocks && latexBlocks.length > 0) {
        latexCode = latexBlocks.map(block => {
            // Убираем обрамляющие символы \[ и \] или \( и \)
            return block.replace(/^\\[\[\]()]|\\[\[\]()]$/g, '').trim();
        }).join('\n');
    }
    
    // Сохраняем LaTeX код в data-атрибут
    if (latexCode) {
        formulaBox.dataset.latexCode = latexCode;
    }
    
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋';
    copyBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: var(--accent-color);
        color: white;
        border: none;
        padding: 5px 10px;
        border-radius: 5px;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.3s ease;
    `;
    copyBtn.title = 'Копировать формулу';
    
    formulaBox.appendChild(copyBtn);
    
    formulaBox.addEventListener('mouseenter', () => {
        copyBtn.style.opacity = '1';
    });
    
    formulaBox.addEventListener('mouseleave', () => {
        copyBtn.style.opacity = '0';
    });
    
    copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Используем сохраненный LaTeX код или пытаемся извлечь из HTML
        let formulaText = formulaBox.dataset.latexCode || '';
        
        if (!formulaText) {
            // Если не сохранили заранее, пытаемся извлечь из текущего HTML
            const innerHTML = formulaBox.innerHTML;
            const latexBlocks = innerHTML.match(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g);
            
            if (latexBlocks && latexBlocks.length > 0) {
                formulaText = latexBlocks.map(block => {
                    return block.replace(/^\\[\[\]()]|\\[\[\]()]$/g, '').trim();
                }).join('\n');
            } else {
                // Fallback: используем textContent
                formulaText = formulaBox.textContent
                    .replace('📋', '')
                    .replace(/\s+/g, ' ')
                    .trim();
            }
        }
        
        navigator.clipboard.writeText(formulaText).then(() => {
            copyBtn.textContent = '✅';
            setTimeout(() => {
                copyBtn.textContent = '📋';
            }, 2000);
        }).catch(err => {
            console.error('Ошибка копирования:', err);
            copyBtn.textContent = '❌';
            setTimeout(() => {
                copyBtn.textContent = '📋';
            }, 2000);
        });
    });
});

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
    exportBtn.textContent = '📄 Экспорт в PDF';
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
    localStorage.setItem(key, window.pageYOffset);
});

window.addEventListener('load', () => {
    const key = 'scrollPosition_' + location.pathname;
    const savedPosition = localStorage.getItem(key);
    if (savedPosition) {
        window.scrollTo(0, parseInt(savedPosition));
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