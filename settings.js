// ============================================
// СИСТЕМА НАСТРОЕК САЙТА
// ============================================

// Настройки по умолчанию
const defaultSettings = {
    theme: 'light',
    newYearMode: false,
    animationLevel: 'max',
    hoverEffects: true
};

// Текущие настройки
let siteSettings = { ...defaultSettings };

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    applyAllSettings();
    initSettingsButton();
    createSettingsModal();
});

// ============================================
// ЗАГРУЗКА И СОХРАНЕНИЕ НАСТРОЕК
// ============================================

function loadSettings() {
    const saved = localStorage.getItem('siteSettings');
    if (saved) {
        try {
            siteSettings = { ...defaultSettings, ...JSON.parse(saved) };
        } catch (e) {
            console.error('Ошибка загрузки настроек:', e);
            siteSettings = { ...defaultSettings };
        }
    }
}

function saveSettings() {
    localStorage.setItem('siteSettings', JSON.stringify(siteSettings));
}

// ============================================
// ПРИМЕНЕНИЕ НАСТРОЕК
// ============================================

function applyAllSettings() {
    applyTheme(siteSettings.theme);
    applyAnimationLevel(siteSettings.animationLevel);
    applyHoverEffects(siteSettings.hoverEffects);
}

function applyHoverEffects(enabled) {
    if (enabled) {
        document.body.classList.remove('no-hover');
    } else {
        document.body.classList.add('no-hover');
    }
}

function applyTheme(theme) {
    const isDark = theme === 'dark';
    
    if (isDark) {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
    
    // Сохраняем для совместимости со старым кодом
    localStorage.setItem('theme', theme);
}

function applyAnimationLevel(level) {
    // Убираем все классы уровней анимации
    document.body.classList.remove('animations-max', 'animations-medium', 'animations-off');
    
    // Добавляем нужный класс
    document.body.classList.add(`animations-${level}`);
}

// ============================================
// КНОПКА НАСТРОЕК
// ============================================

function initSettingsButton() {
    // Создаём фиксированную кнопку (для десктопа)
    if (!document.getElementById('settingsButton')) {
        const button = document.createElement('button');
        button.id = 'settingsButton';
        button.className = 'settings-button';
        button.setAttribute('aria-label', 'Настройки');
        button.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;">⚙️</span>';
        button.title = 'Настройки сайта';
        
        button.addEventListener('click', openSettingsModal);
        
        document.body.appendChild(button);
    }
    
    // Создаём кнопку в sidebar (для мобильных)
    const sidebarHeader = document.querySelector('.sidebar-header');
    if (sidebarHeader && !document.getElementById('settingsButtonSidebar')) {
        // Проверяем, есть ли уже контейнер для кнопок
        let buttonsContainer = sidebarHeader.querySelector('.sidebar-header-buttons');
        
        if (!buttonsContainer) {
            // Создаём контейнер для кнопок
            buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'sidebar-header-buttons';
            
            // Перемещаем существующие кнопки в контейнер
            const existingButtons = sidebarHeader.querySelectorAll('.sidebar-collapse-btn, .close-sidebar, .theme-toggle, .ny-toggle');
            existingButtons.forEach(btn => {
                buttonsContainer.appendChild(btn);
            });
            
            sidebarHeader.appendChild(buttonsContainer);
        }
        
        // Создаём кнопку настроек
        const sidebarButton = document.createElement('button');
        sidebarButton.id = 'settingsButtonSidebar';
        sidebarButton.className = 'settings-button-sidebar';
        sidebarButton.setAttribute('aria-label', 'Настройки');
        sidebarButton.innerHTML = '<span style="display:inline-flex;align-items:center;justify-content:center;width:100%;height:100%;">⚙️</span>';
        sidebarButton.title = 'Настройки сайта';
        
        sidebarButton.addEventListener('click', openSettingsModal);
        
        // Вставляем перед кнопкой закрытия (она должна быть последней)
        const closeButton = buttonsContainer.querySelector('.close-sidebar');
        if (closeButton) {
            buttonsContainer.insertBefore(sidebarButton, closeButton);
        } else {
            buttonsContainer.appendChild(sidebarButton);
        }
    }
}

// ============================================
// МОДАЛЬНОЕ ОКНО НАСТРОЕК
// ============================================

function createSettingsModal() {
    // Проверяем, не создано ли уже модальное окно
    if (document.getElementById('settingsModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'settings-modal hidden';
    modal.innerHTML = `
        <div class="settings-modal-content">
            <div class="settings-modal-header">
                <h2>⚙️ Настройки</h2>
                <button class="settings-close-btn" id="settingsCloseBtn">✕</button>
            </div>
            
            <div class="settings-modal-body">
                <!-- Тема -->
                <div class="settings-section">
                    <h3>🎨 Тема оформления</h3>
                    <div class="settings-option">
                        <div class="theme-selector">
                            <button class="theme-option ${siteSettings.theme === 'light' ? 'active' : ''}" data-theme="light">
                                <div class="theme-preview light-preview">
                                    <div class="preview-header"></div>
                                    <div class="preview-content"></div>
                                </div>
                                <span>☀️ Светлая</span>
                            </button>
                            <button class="theme-option ${siteSettings.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                                <div class="theme-preview dark-preview">
                                    <div class="preview-header"></div>
                                    <div class="preview-content"></div>
                                </div>
                                <span>🌙 Темная</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Новогодний вайб (скрыт, код сохранён) -->
                <div class="settings-section" id="nySettingsSection" style="display: none;">
                    <h3>🎄 Новогодний вайб</h3>
                    <div class="settings-option">
                        <label class="toggle-switch">
                            <input type="checkbox" id="newYearToggle" ${siteSettings.newYearMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                            <span class="toggle-label">Включить новогоднее настроение со снегом и украшениями</span>
                        </label>
                        <button class="ny-advanced-settings" id="nyAdvancedBtn" style="margin-top: 0.75rem;">
                            🎨 Дополнительные настройки снега
                        </button>
                    </div>
                </div>

                <!-- Анимации -->
                <div class="settings-section">
                    <h3>✨ Уровень анимаций</h3>
                    <div class="settings-option">
                        <div class="animation-level-selector">
                            <button class="animation-level-option ${siteSettings.animationLevel === 'max' ? 'active' : ''}" data-level="max">
                                <span class="level-icon">🚀</span>
                                <span class="level-title">Максимальный</span>
                                <span class="level-desc">Все анимации и эффекты</span>
                            </button>
                            <button class="animation-level-option ${siteSettings.animationLevel === 'medium' ? 'active' : ''}" data-level="medium">
                                <span class="level-icon">⚡</span>
                                <span class="level-title">Средний</span>
                                <span class="level-desc">Основные анимации</span>
                            </button>
                            <button class="animation-level-option ${siteSettings.animationLevel === 'off' ? 'active' : ''}" data-level="off">
                                <span class="level-icon">🔇</span>
                                <span class="level-title">Выключено</span>
                                <span class="level-desc">Без анимаций (быстрее)</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Hover-эффекты -->
                <div class="settings-section">
                    <h3>👆 Hover-эффекты</h3>
                    <div class="settings-option">
                        <label class="toggle-switch">
                            <input type="checkbox" id="hoverToggle" ${siteSettings.hoverEffects ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                            <span class="toggle-label">Эффекты при наведении курсора (масштабирование, подсветка, тени)</span>
                        </label>
                    </div>
                </div>

                <!-- Кнопки действий -->
                <div class="settings-actions">
                    <button class="settings-reset-btn" id="settingsResetBtn">
                        🔄 Сбросить всё
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Привязываем обработчики
    bindSettingsHandlers();
}

function bindSettingsHandlers() {
    // Закрытие модального окна
    const closeBtn = document.getElementById('settingsCloseBtn');
    const modal = document.getElementById('settingsModal');
    
    closeBtn.addEventListener('click', closeSettingsModal);
    
    // Закрытие по клику на фон
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSettingsModal();
        }
    });
    
    // Закрытие по Escape (только если это окно открыто)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const settingsModalElement = document.getElementById('settingsModal');
            const nySettingsModalElement = document.getElementById('nySettingsModal');
            
            // Закрываем только если наше окно открыто и окно настроек снега закрыто
            if (settingsModalElement && 
                !settingsModalElement.classList.contains('hidden') &&
                (!nySettingsModalElement || nySettingsModalElement.classList.contains('hidden'))) {
                closeSettingsModal();
            }
        }
    });
    
    // Переключение темы
    const themeButtons = document.querySelectorAll('.theme-option');
    themeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const theme = btn.dataset.theme;
            siteSettings.theme = theme;
            
            // Обновляем UI
            themeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Применяем и сохраняем
            applyTheme(theme);
            saveSettings();
            
            // Анимация кнопки
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => btn.style.transform = '', 150);
        });
    });
    
    // Переключение новогоднего режима
    const newYearToggle = document.getElementById('newYearToggle');
    newYearToggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        siteSettings.newYearMode = enabled;
        
        // Применяем через глобальную функцию из newyear.js
        if (typeof isNewYearMode !== 'undefined') {
            if (enabled && !isNewYearMode) {
                toggleNewYearMode();
            } else if (!enabled && isNewYearMode) {
                toggleNewYearMode();
            }
        }
        
        // Сохраняем
        localStorage.setItem('newYearMode', enabled);
        saveSettings();
    });
    
    // Кнопка дополнительных настроек снега
    const nyAdvancedBtn = document.getElementById('nyAdvancedBtn');
    nyAdvancedBtn.addEventListener('click', () => {
        // Открываем модальное окно настроек снега из newyear.js
        closeSettingsModal(); // Закрываем наше окно настроек
        setTimeout(() => {
            // Используем глобальную функцию из newyear.js
            if (typeof window.nyOpenSettingsModal === 'function') {
                window.nyOpenSettingsModal();
            } else {
                // Fallback - открываем напрямую
                const nySettingsModal = document.getElementById('nySettingsModal');
                if (nySettingsModal) {
                    nySettingsModal.classList.remove('hidden');
                    document.body.style.overflow = 'hidden';
                }
            }
        }, 300);
    });
    
    // Переключение уровня анимаций
    const animationButtons = document.querySelectorAll('.animation-level-option');
    animationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const level = btn.dataset.level;
            siteSettings.animationLevel = level;
            
            // Обновляем UI
            animationButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Применяем и сохраняем
            applyAnimationLevel(level);
            saveSettings();
            
            // Анимация кнопки
            btn.style.transform = 'scale(0.95)';
            setTimeout(() => btn.style.transform = '', 150);
            
            // Показываем уведомление
            showNotification(getAnimationLevelMessage(level));
        });
    });
    
    // Hover-эффекты
    const hoverToggle = document.getElementById('hoverToggle');
    if (hoverToggle) {
        hoverToggle.addEventListener('change', (e) => {
            siteSettings.hoverEffects = e.target.checked;
            applyHoverEffects(e.target.checked);
            saveSettings();
            showNotification(e.target.checked ? 'Hover-эффекты включены 👆' : 'Hover-эффекты выключены');
        });
    }

    // Сброс настроек
    const resetBtn = document.getElementById('settingsResetBtn');
    resetBtn.addEventListener('click', resetAllSettings);
}

function getAnimationLevelMessage(level) {
    const messages = {
        'max': 'Максимальный уровень анимаций включен! 🚀',
        'medium': 'Средний уровень анимаций включен ⚡',
        'off': 'Анимации выключены 🔇'
    };
    return messages[level] || 'Настройки применены';
}

// ============================================
// ОТКРЫТИЕ/ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА
// ============================================

function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        
        const newYearToggle = document.getElementById('newYearToggle');
        if (newYearToggle && typeof isNewYearMode !== 'undefined') {
            newYearToggle.checked = isNewYearMode;
        }
        const hoverToggle = document.getElementById('hoverToggle');
        if (hoverToggle) {
            hoverToggle.checked = siteSettings.hoverEffects;
        }
    }
}

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// ============================================
// СБРОС НАСТРОЕК
// ============================================

function resetAllSettings() {
    if (confirm('Вы уверены, что хотите сбросить все настройки на значения по умолчанию?')) {
        // Сбрасываем настройки
        siteSettings = { ...defaultSettings };
        
        // Применяем
        applyAllSettings();
        
        // Сбрасываем новогодний режим
        if (typeof isNewYearMode !== 'undefined' && isNewYearMode !== defaultSettings.newYearMode) {
            toggleNewYearMode();
        }
        
        // Сохраняем
        saveSettings();
        
        // Закрываем модальное окно
        closeSettingsModal();
        
        // Перезагружаем страницу для применения всех изменений
        setTimeout(() => {
            location.reload();
        }, 500);
        
        showNotification('Настройки сброшены! Страница будет перезагружена... 🔄');
    }
}

// ============================================
// УВЕДОМЛЕНИЯ
// ============================================

function showNotification(message) {
    // Создаём уведомление
    const notification = document.createElement('div');
    notification.className = 'settings-notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    // Показываем
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    // Скрываем и удаляем
    setTimeout(() => {
        notification.classList.remove('show');
    }, 2500);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 2800);
}

// ============================================
// SWIPE-TO-DISMISS ДЛЯ МОДАЛКИ НАСТРОЕК
// ============================================

function initSettingsSwipe() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;

    let startY = 0;
    let currentY = 0;
    let activated = false;
    let tracking = false;
    const DEAD_ZONE = 15;

    function getContent() {
        return modal.querySelector('.settings-modal-content');
    }

    modal.addEventListener('touchstart', (e) => {
        if (window.innerWidth > 768) return;
        const content = getContent();
        if (!content) return;
        if (content.scrollTop > 5) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        tracking = true;
        activated = false;
    }, { passive: true });

    modal.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        const content = getContent();
        if (!content) return;
        currentY = e.touches[0].clientY;
        const deltaY = currentY - startY;

        if (!activated) {
            if (deltaY > DEAD_ZONE) {
                activated = true;
                startY = currentY;
                content.style.transition = 'none';
            }
            return;
        }

        const swipeDelta = currentY - startY;
        if (swipeDelta > 0) {
            e.preventDefault();
            content.style.transform = `translateY(${swipeDelta}px)`;
            modal.style.background = `rgba(0, 0, 0, ${Math.max(0, 0.75 - swipeDelta / 400)})`;
        }
    }, { passive: false });

    modal.addEventListener('touchend', () => {
        if (!tracking) return;
        tracking = false;

        if (!activated) return;
        activated = false;

        const content = getContent();
        if (!content) return;
        const deltaY = currentY - startY;

        if (deltaY > 60) {
            content.style.transition = 'transform 0.25s ease-out';
            content.style.transform = 'translateY(100vh)';
            modal.style.transition = 'background 0.25s ease-out';
            modal.style.background = 'rgba(0, 0, 0, 0)';
            setTimeout(() => {
                closeSettingsModal();
                content.style.transition = '';
                content.style.transform = '';
                modal.style.transition = '';
                modal.style.background = '';
            }, 250);
        } else {
            content.style.transition = 'transform 0.25s ease-out';
            content.style.transform = '';
            modal.style.transition = 'background 0.25s ease-out';
            modal.style.background = '';
            setTimeout(() => {
                content.style.transition = '';
                modal.style.transition = '';
            }, 250);
        }
    });
}

document.addEventListener('DOMContentLoaded', initSettingsSwipe);

// ============================================
// ЭКСПОРТ ДЛЯ СОВМЕСТИМОСТИ
// ============================================

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.siteSettings = siteSettings;

console.log('⚙️ Система настроек загружена');
