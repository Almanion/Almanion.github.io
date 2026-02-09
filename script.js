// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initMath();
    initNavigation();
    initSearch();
    initScrollEffects();
    initDerivationToggles();
    initMobileMenu();
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
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(document.body, {
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
            
            // Удаляем активный класс у всех ссылок
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Добавляем активный класс к кликнутой ссылке
            link.classList.add('active');
            
            // Прокрутка к секции
            const targetId = link.getAttribute('href').substring(1);
            const targetElement = document.getElementById(targetId);
            
            if (targetElement) {
                const offset = 20;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - offset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
                
                // Закрываем мобильное меню
                closeMobileMenu();
            }
        });
    });
    
    // Автоматическое выделение активной секции при скролле
    let scrollTimeout;
    
    function updateActiveSection() {
        let currentSection = '';
        
        topics.forEach(topic => {
            // Пропускаем элементы без id (например, .content-section)
            const id = topic.getAttribute('id');
            if (!id) return;
            
            // getBoundingClientRect().top — точная позиция относительно viewport
            const rect = topic.getBoundingClientRect();
            if (rect.top <= 120) {
                currentSection = id;
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            
            if (link.getAttribute('href') === `#${currentSection}`) {
                link.classList.add('active');
            }
        });
    }
    
    window.addEventListener('scroll', () => {
        if (scrollTimeout) {
            cancelAnimationFrame(scrollTimeout);
        }
        scrollTimeout = requestAnimationFrame(updateActiveSection);
    }, { passive: true });
}

// ============================================
// ПОИСК
// ============================================

function initSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return; // Защита от null
    
    // Поддерживаем оба варианта: .topic и .content-section
    const topics = document.querySelectorAll('.topic, .content-section');
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            // Показываем все топики и убираем подсветку
            topics.forEach(topic => {
                topic.style.display = 'block';
                removeHighlights(topic);
            });
            return;
        }
        
        topics.forEach(topic => {
            const text = topic.textContent.toLowerCase();
            
            if (text.includes(searchTerm)) {
                topic.style.display = 'block';
                highlightText(topic, searchTerm);
            } else {
                topic.style.display = 'none';
                removeHighlights(topic);
            }
        });
    });
}

function highlightText(element, searchTerm) {
    // Удаляем предыдущую подсветку
    removeHighlights(element);
    
    // Получаем все текстовые узлы
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Пропускаем узлы в KaTeX формулах
                if (node.parentElement.closest('.katex')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );
    
    const textNodes = [];
    while (walker.nextNode()) {
        textNodes.push(walker.currentNode);
    }
    
    // Подсвечиваем найденный текст
    textNodes.forEach(node => {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        const index = lowerText.indexOf(searchTerm);
        
        if (index !== -1) {
            const before = text.substring(0, index);
            const match = text.substring(index, index + searchTerm.length);
            const after = text.substring(index + searchTerm.length);
            
            const span = document.createElement('span');
            span.className = 'highlight';
            span.textContent = match;
            
            const fragment = document.createDocumentFragment();
            fragment.appendChild(document.createTextNode(before));
            fragment.appendChild(span);
            fragment.appendChild(document.createTextNode(after));
            
            node.parentNode.replaceChild(fragment, node);
        }
    });
}

function removeHighlights(element) {
    const highlights = element.querySelectorAll('.highlight');
    highlights.forEach(highlight => {
        const text = highlight.textContent;
        highlight.replaceWith(text);
    });
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
    // Убираем collapsed если был (на случай ресайза)
    sidebar.classList.remove('collapsed');
    if (overlay) {
        overlay.classList.add('active');
    }
    
    // Блокируем прокрутку на мобильных
    if (window.innerWidth <= 768) {
        document.body.classList.add('sidebar-open');
        // Исправление высоты на мобильных (iOS Safari и т.п.)
        sidebar.style.height = window.innerHeight + 'px';
    }
}

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    
    if (sidebar) {
        sidebar.classList.remove('open');
        // Сбрасываем инлайновую высоту
        sidebar.style.height = '';
    }
    if (overlay) {
        overlay.classList.remove('active');
    }
    
    // Разблокируем прокрутку
    document.body.classList.remove('sidebar-open');
}

// Обновляем высоту сайдбара при изменении размера окна (поворот экрана)
window.addEventListener('resize', () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open') && window.innerWidth <= 768) {
        sidebar.style.height = window.innerHeight + 'px';
    }
    // На десктопе убираем collapsed при переключении на мобильный вид
    if (window.innerWidth <= 768) {
        if (sidebar) sidebar.classList.remove('collapsed');
        document.body.classList.remove('sidebar-collapsed');
    }
});

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
    window.print();
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
            transition: width 0.3s ease;
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
    localStorage.setItem('scrollPosition', window.pageYOffset);
});

window.addEventListener('load', () => {
    const savedPosition = localStorage.getItem('scrollPosition');
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