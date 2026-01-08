// ============================================
// НОВОГОДНИЙ ВАЙБ
// ============================================

let isNewYearMode = false;
let snowflakes = [];
let animationFrame = null;

// Настройки снегопада (по умолчанию)
let snowSettings = {
    count: 60,        // Количество снежинок
    speed: 1,          // Скорость падения (множитель)
    size: 1,           // Размер снежинок (множитель)
    drift: 1,          // Дрейф по горизонтали (множитель)
    opacity: 0.8       // Прозрачность
};

// Тройной клик
let clickCount = 0;
let clickTimer = null;

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Загружаем настройки из localStorage
    loadSettings();
    
    // Проверяем сохранённое состояние (по умолчанию включён)
    const savedState = localStorage.getItem('newYearMode');
    if (savedState === null || savedState === 'true') {
        isNewYearMode = true;
        enableNewYearMode();
    }

    // Привязываем кнопку
    const nyToggle = document.getElementById('nyToggle');
    if (nyToggle) {
        nyToggle.addEventListener('click', handleButtonClick);
        updateButtonState();
    }

    // Добавляем пасхалки на клики
    initEasterEggs();
    
    // Инициализируем модальное окно настроек
    initSettingsModal();
});

// ============================================
// ОБРАБОТКА КЛИКОВ
// ============================================

function handleButtonClick() {
    clickCount++;
    
    // Сбрасываем таймер
    if (clickTimer) {
        clearTimeout(clickTimer);
    }
    
    // Двойной клик - открываем настройки
    if (clickCount === 2) {
        clickCount = 0;
        openSettingsModal();
        return;
    }
    
    // Одинарный клик - переключаем режим (с задержкой, чтобы проверить на тройной)
    clickTimer = setTimeout(() => {
        if (clickCount === 1) {
            toggleNewYearMode();
        }
        clickCount = 0;
    }, 200);
}

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
    for (let i = 0; i < snowSettings.count; i++) {
        createSnowflake();
    }

    // Запускаем анимацию
    animateSnow();
}

function createSnowflake() {
    const baseSize = Math.random() * 3 + 2; // 2-5px
    const baseSpeed = Math.random() * 1 + 0.5; // 0.5-1.5
    const baseDrift = Math.random() * 0.5 - 0.25; // -0.25 до 0.25
    
    const baseOpacity = Math.random() * 0.6 + 0.3;
    
    const snowflake = {
        x: Math.random() * window.innerWidth,
        y: Math.random() * -window.innerHeight, // Начинаем выше экрана
        size: baseSize * snowSettings.size,
        speed: baseSpeed * snowSettings.speed,
        drift: baseDrift * snowSettings.drift,
        opacity: baseOpacity * snowSettings.opacity,
        element: null
    };

    // Создаём DOM элемент
    const div = document.createElement('div');
    div.className = 'snowflake';
    div.style.cssText = `
        left: ${snowflake.x}px;
        top: ${snowflake.y}px;
        font-size: ${snowflake.size * 5}px;
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
        header.innerHTML = '🎄 ' + header.textContent + ' 🎅🏼';
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
        'Пасхалочка!)) 🎅🏼'
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
// НАСТРОЙКИ
// ============================================

function loadSettings() {
    const saved = localStorage.getItem('snowSettings');
    if (saved) {
        try {
            snowSettings = JSON.parse(saved);
        } catch (e) {
            console.error('Ошибка загрузки настроек:', e);
        }
    }
}

function saveSettings() {
    localStorage.setItem('snowSettings', JSON.stringify(snowSettings));
}

function initSettingsModal() {
    // Создаём HTML модального окна, если его ещё нет
    if (document.getElementById('nySettingsModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'nySettingsModal';
    modal.className = 'ny-settings-modal hidden';
    modal.innerHTML = `
        <div class="ny-settings-content">
            <div class="ny-settings-header">
                <h3>⚙️ Настройки новогоднего вайба</h3>
                <button class="ny-settings-close" id="nySettingsClose">✕</button>
            </div>
            <div class="ny-settings-body">
                <div class="ny-setting-item">
                    <label>
                        <span>❄️ Количество снежинок(для 100+ требуется мощный проц)</span>
                        <input type="range" id="snowCount" min="10" max="200" step="10" value="${snowSettings.count}">
                        <span class="ny-setting-value" id="snowCountValue">${snowSettings.count}</span>
                    </label>
                </div>
                
                <div class="ny-setting-item">
                    <label>
                        <span>⚡ Скорость падения</span>
                        <input type="range" id="snowSpeed" min="0.2" max="2" step="0.1" value="${snowSettings.speed}">
                        <span class="ny-setting-value" id="snowSpeedValue">${snowSettings.speed.toFixed(1)}x</span>
                    </label>
                </div>
                
                <div class="ny-setting-item">
                    <label>
                        <span>📏 Размер снежинок</span>
                        <input type="range" id="snowSize" min="0.2" max="2" step="0.1" value="${snowSettings.size}">
                        <span class="ny-setting-value" id="snowSizeValue">${snowSettings.size.toFixed(1)}x</span>
                    </label>
                </div>
                
                <div class="ny-setting-item">
                    <label>
                        <span>💨 Дрейф (покачивание)</span>
                        <input type="range" id="snowDrift" min="0" max="2" step="0.1" value="${snowSettings.drift}">
                        <span class="ny-setting-value" id="snowDriftValue">${snowSettings.drift.toFixed(1)}x</span>
                    </label>
                </div>
                
                <div class="ny-setting-item">
                    <label>
                        <span>✨ Прозрачность</span>
                        <input type="range" id="snowOpacity" min="0" max="0.95" step="0.05" value="${snowSettings.opacity}">
                        <span class="ny-setting-value" id="snowOpacityValue">${Math.round(snowSettings.opacity * 100)}%</span>
                    </label>
                </div>
            </div>
            <div class="ny-settings-footer">
                <button class="ny-settings-reset" id="nySettingsReset">🔄 Сбросить</button>
                <button class="ny-settings-apply" id="nySettingsApply">✅ Применить</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Привязываем обработчики
    document.getElementById('nySettingsClose').addEventListener('click', closeSettingsModal);
    document.getElementById('nySettingsApply').addEventListener('click', applySettings);
    document.getElementById('nySettingsReset').addEventListener('click', resetSettings);
    
    // Обновление значений при изменении слайдеров
    document.getElementById('snowCount').addEventListener('input', (e) => {
        document.getElementById('snowCountValue').textContent = e.target.value;
    });
    
    document.getElementById('snowSpeed').addEventListener('input', (e) => {
        document.getElementById('snowSpeedValue').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });
    
    document.getElementById('snowSize').addEventListener('input', (e) => {
        document.getElementById('snowSizeValue').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });
    
    document.getElementById('snowDrift').addEventListener('input', (e) => {
        document.getElementById('snowDriftValue').textContent = parseFloat(e.target.value).toFixed(1) + 'x';
    });
    
    document.getElementById('snowOpacity').addEventListener('input', (e) => {
        document.getElementById('snowOpacityValue').textContent = Math.round(parseFloat(e.target.value) * 100) + '%';
    });
    
    // Закрытие по клику вне модального окна
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSettingsModal();
        }
    });
}

function openSettingsModal() {
    const modal = document.getElementById('nySettingsModal');
    if (modal) {
        // Обновляем значения перед открытием
        document.getElementById('snowCount').value = snowSettings.count;
        document.getElementById('snowSpeed').value = snowSettings.speed;
        document.getElementById('snowSize').value = snowSettings.size;
        document.getElementById('snowDrift').value = snowSettings.drift;
        document.getElementById('snowOpacity').value = snowSettings.opacity;
        
        document.getElementById('snowCountValue').textContent = snowSettings.count;
        document.getElementById('snowSpeedValue').textContent = snowSettings.speed.toFixed(1) + 'x';
        document.getElementById('snowSizeValue').textContent = snowSettings.size.toFixed(1) + 'x';
        document.getElementById('snowDriftValue').textContent = snowSettings.drift.toFixed(1) + 'x';
        document.getElementById('snowOpacityValue').textContent = Math.round(snowSettings.opacity * 100) + '%';
        
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('nySettingsModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

function applySettings() {
    // Получаем новые значения
    snowSettings.count = parseInt(document.getElementById('snowCount').value);
    snowSettings.speed = parseFloat(document.getElementById('snowSpeed').value);
    snowSettings.size = parseFloat(document.getElementById('snowSize').value);
    snowSettings.drift = parseFloat(document.getElementById('snowDrift').value);
    snowSettings.opacity = parseFloat(document.getElementById('snowOpacity').value);
    
    // Сохраняем
    saveSettings();
    
    // Перезапускаем снегопад, если он активен
    if (isNewYearMode) {
        stopSnowfall();
        startSnowfall();
    }
    
    // Закрываем модальное окно
    closeSettingsModal();
    
    // Показываем уведомление
    const notification = document.createElement('div');
    notification.className = 'ny-notification';
    notification.textContent = 'Настройки применены! ✨';
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 2000);
}

function resetSettings() {
    // Сбрасываем на значения по умолчанию
    snowSettings = {
        count: 100,
        speed: 1,
        size: 1,
        drift: 1,
        opacity: 0.8
    };
    
    // Обновляем UI
    document.getElementById('snowCount').value = snowSettings.count;
    document.getElementById('snowSpeed').value = snowSettings.speed;
    document.getElementById('snowSize').value = snowSettings.size;
    document.getElementById('snowDrift').value = snowSettings.drift;
    document.getElementById('snowOpacity').value = snowSettings.opacity;
    
    document.getElementById('snowCountValue').textContent = snowSettings.count;
    document.getElementById('snowSpeedValue').textContent = snowSettings.speed.toFixed(1) + 'x';
    document.getElementById('snowSizeValue').textContent = snowSettings.size.toFixed(1) + 'x';
    document.getElementById('snowDriftValue').textContent = snowSettings.drift.toFixed(1) + 'x';
    document.getElementById('snowOpacityValue').textContent = Math.round(snowSettings.opacity * 100) + '%';
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

