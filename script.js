// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initMath();
    initNavigation();
    initSearch();
    initScrollEffects();
    initDerivationToggles();
    initMobileMenu();
});

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
    const topics = document.querySelectorAll('.topic');
    
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
    let isScrolling = false;
    
    window.addEventListener('scroll', () => {
        if (isScrolling) return;
        
        isScrolling = true;
        
        setTimeout(() => {
            let currentSection = '';
            
            topics.forEach(topic => {
                const topicTop = topic.offsetTop;
                const topicHeight = topic.clientHeight;
                
                if (window.pageYOffset >= topicTop - 100) {
                    currentSection = topic.getAttribute('id');
                }
            });
            
            navLinks.forEach(link => {
                link.classList.remove('active');
                
                if (link.getAttribute('href') === `#${currentSection}`) {
                    link.classList.add('active');
                }
            });
            
            isScrolling = false;
        }, 100);
    });
}

// ============================================
// ПОИСК
// ============================================

function initSearch() {
    const searchInput = document.getElementById('searchInput');
    const topics = document.querySelectorAll('.topic');
    
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
    
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            scrollToTopBtn.classList.add('visible');
        } else {
            scrollToTopBtn.classList.remove('visible');
        }
    });
    
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
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
    
    const topics = document.querySelectorAll('.topic');
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
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.add('open');
    });
    
    closeSidebar.addEventListener('click', () => {
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

function closeMobileMenu() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('open');
}

// ============================================
// ГОРЯЧИЕ КЛАВИШИ
// ============================================

document.addEventListener('keydown', (e) => {
    // Ctrl + K или Cmd + K для фокуса на поиске
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        searchInput.focus();
    }
    
    // Escape для закрытия мобильного меню
    if (e.key === 'Escape') {
        closeMobileMenu();
    }
    
});

// ============================================
// КОПИРОВАНИЕ ФОРМУЛ
// ============================================

document.querySelectorAll('.formula-box').forEach(formulaBox => {
    formulaBox.style.position = 'relative';
    
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
        
        const formulaText = formulaBox.textContent
            .replace('📋', '')
            .replace(/\s+/g, ' ')
            .trim();
        
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

function updateProgress() {
    const topics = document.querySelectorAll('.topic');
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    const progress = (scrollTop / (documentHeight - windowHeight)) * 100;
    
    // Можно добавить прогресс-бар
    let progressBar = document.getElementById('progressBar');
    if (!progressBar) {
        progressBar = document.createElement('div');
        progressBar.id = 'progressBar';
        progressBar.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: ${progress}%;
            height: 4px;
            background: var(--accent-color);
            z-index: 9999;
            transition: width 0.3s ease;
        `;
        document.body.appendChild(progressBar);
    } else {
        progressBar.style.width = progress + '%';
    }
}

window.addEventListener('scroll', updateProgress);
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

window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);
});

console.log('✅ Сайт конспектов загружен успешно!');
console.log('💡 Горячие клавиши:');
console.log('   • Ctrl/Cmd + K - Поиск');
console.log('   • Escape - Закрыть меню');
