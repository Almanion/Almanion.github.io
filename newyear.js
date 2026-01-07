// ============================================
// НОВОГОДНИЙ ВАЙБ
// ============================================

let isNewYearMode = false;
let snowflakes = [];
const MAX_SNOWFLAKES = 50;
let animationFrame = null;

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Проверяем сохранённое состояние
    const savedState = localStorage.getItem('newYearMode');
    if (savedState === 'true') {
        isNewYearMode = true;
        enableNewYearMode();
    }

    // Привязываем кнопку
    const nyToggle = document.getElementById('nyToggle');
    if (nyToggle) {
        nyToggle.addEventListener('click', toggleNewYearMode);
        updateButtonState();
    }

    // Добавляем пасхалки на клики
    initEasterEggs();
});

// ============================================
// ПЕРЕКЛЮЧЕНИЕ РЕЖИМА
// ============================================

function toggleNewYearMode() {
    isNewYearMode = !isNewYearMode;
    localStorage.setItem('newYearMode', isNewYearMode);
    
    if (isNewYearMode) {
        enableNewYearMode();
    } else {
        disableNewYearMode();
    }
    
    updateButtonState();
}

function updateButtonState() {
    const nyToggle = document.getElementById('nyToggle');
    if (nyToggle) {
        nyToggle.style.transform = isNewYearMode ? 'scale(1.2)' : 'scale(1)';
        nyToggle.style.filter = isNewYearMode ? 'drop-shadow(0 0 8px rgba(255, 215, 0, 0.8))' : 'none';
    }
}

// ============================================
// ВКЛЮЧЕНИЕ НОВОГОДНЕГО РЕЖИМА
// ============================================

function enableNewYearMode() {
    document.body.classList.add('new-year-mode');
    startSnowfall();
    addNewYearIcons();
    showNewYearNotification();
}

function disableNewYearMode() {
    document.body.classList.remove('new-year-mode');
    stopSnowfall();
    removeNewYearIcons();
}

// ============================================
// СНЕГОПАД
// ============================================

function startSnowfall() {
    const container = document.getElementById('snowContainer');
    if (!container) return;

    // Создаём снежинки
    snowflakes = [];
    for (let i = 0; i < MAX_SNOWFLAKES; i++) {
        createSnowflake();
    }

    // Запускаем анимацию
    animateSnow();
}

function createSnowflake() {
    const snowflake = {
        x: Math.random() * window.innerWidth,
        y: Math.random() * -window.innerHeight, // Начинаем выше экрана
        size: Math.random() * 3 + 2, // 2-5px
        speed: Math.random() * 1 + 0.5, // 0.5-1.5 скорость падения
        drift: Math.random() * 0.5 - 0.25, // -0.25 до 0.25 (дрейф по горизонтали)
        opacity: Math.random() * 0.6 + 0.3, // 0.3-0.9
        element: null
    };

    // Создаём DOM элемент
    const div = document.createElement('div');
    div.className = 'snowflake';
    div.style.cssText = `
        left: ${snowflake.x}px;
        top: ${snowflake.y}px;
        width: ${snowflake.size}px;
        height: ${snowflake.size}px;
        opacity: ${snowflake.opacity};
    `;
    div.innerHTML = '❄';
    
    const container = document.getElementById('snowContainer');
    if (container) {
        container.appendChild(div);
        snowflake.element = div;
    }

    snowflakes.push(snowflake);
}

function animateSnow() {
    if (!isNewYearMode) return;

    snowflakes.forEach(flake => {
        if (!flake.element) return;

        // Обновляем позицию
        flake.y += flake.speed;
        flake.x += flake.drift;

        // Если снежинка упала за экран, возвращаем наверх
        if (flake.y > window.innerHeight) {
            flake.y = -20;
            flake.x = Math.random() * window.innerWidth;
        }

        // Если снежинка ушла за край экрана по горизонтали
        if (flake.x > window.innerWidth) {
            flake.x = 0;
        } else if (flake.x < 0) {
            flake.x = window.innerWidth;
        }

        // Применяем позицию
        flake.element.style.transform = `translate(${flake.x}px, ${flake.y}px)`;
    });

    animationFrame = requestAnimationFrame(animateSnow);
}

function stopSnowfall() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    // Удаляем все снежинки
    snowflakes.forEach(flake => {
        if (flake.element && flake.element.parentNode) {
            flake.element.parentNode.removeChild(flake.element);
        }
    });
    snowflakes = [];

    const container = document.getElementById('snowContainer');
    if (container) {
        container.innerHTML = '';
    }
}

// ============================================
// НОВОГОДНИЕ ИКОНКИ
// ============================================

function addNewYearIcons() {
    // Меняем иконки в header
    const header = document.querySelector('.page-header h1');
    if (header && !header.dataset.originalText) {
        header.dataset.originalText = header.textContent;
        header.innerHTML = '🎄 ' + header.textContent + ' 🎅';
    }

    // Добавляем новогодний стиль к статкартам
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        if (!card.classList.contains('ny-decorated')) {
            card.classList.add('ny-decorated');
        }
    });
}

function removeNewYearIcons() {
    // Возвращаем оригинальный текст
    const header = document.querySelector('.page-header h1');
    if (header && header.dataset.originalText) {
        header.textContent = header.dataset.originalText;
        delete header.dataset.originalText;
    }

    // Убираем новогодний стиль
    const statCards = document.querySelectorAll('.stat-card');
    statCards.forEach(card => {
        card.classList.remove('ny-decorated');
    });
}

// ============================================
// ПАСХАЛКИ
// ============================================

function initEasterEggs() {
    // Пасхалка 1: При клике на title появляется ёлочка
    const header = document.querySelector('.page-header h1');
    if (header) {
        header.addEventListener('click', () => {
            if (isNewYearMode) {
                createEasterEgg('🎄', header);
            }
        });
    }

    // Пасхалка 2: При решении задачи (клик на кнопку решения) - подарок
    document.addEventListener('click', (e) => {
        if (!isNewYearMode) return;

        // Если кликнули на кнопку задачи
        if (e.target.closest('.task-card')) {
            if (Math.random() < 0.15) { // 15% шанс
                createEasterEgg('🎁', e.target);
            }
        }

        // Если кликнули на кнопку новогоднего режима
        if (e.target.id === 'nyToggle' || e.target.closest('#nyToggle')) {
            const button = document.getElementById('nyToggle');
            if (button && isNewYearMode) {
                createEasterEgg('✨', button);
                createEasterEgg('⭐', button);
            }
        }
    });

    // Пасхалка 3: Случайные снежинки при прокрутке
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        if (!isNewYearMode) return;

        const currentScroll = window.scrollY;
        if (Math.abs(currentScroll - lastScroll) > 200) {
            if (Math.random() < 0.3) { // 30% шанс
                const x = Math.random() * window.innerWidth;
                const y = window.scrollY + Math.random() * window.innerHeight;
                createFloatingEmoji('❄️', x, y);
            }
            lastScroll = currentScroll;
        }
    });
}

function createEasterEgg(emoji, element) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    createFloatingEmoji(emoji, x, y);
}

function createFloatingEmoji(emoji, x, y) {
    const container = document.getElementById('easterEggsContainer');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'easter-egg';
    div.textContent = emoji;
    div.style.cssText = `
        left: ${x}px;
        top: ${y}px;
    `;

    container.appendChild(div);

    // Удаляем после анимации
    setTimeout(() => {
        if (div.parentNode) {
            div.parentNode.removeChild(div);
        }
    }, 2000);
}

function showNewYearNotification() {
    const messages = [
        'С Новым Годом! 🎄',
        'С Рождеством! ✨',
        'Новогодний вайб включен!) ❄️',
        'Пасхалочка!)) 🎅'
    ];
    
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    // Создаём уведомление
    const notification = document.createElement('div');
    notification.className = 'ny-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // Показываем
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    // Скрываем и удаляем
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ============================================
// ОБРАБОТКА ИЗМЕНЕНИЯ РАЗМЕРА ОКНА
// ============================================

window.addEventListener('resize', () => {
    if (isNewYearMode && snowflakes.length > 0) {
        // Пересоздаём снежинки при изменении размера окна
        stopSnowfall();
        startSnowfall();
    }
});

