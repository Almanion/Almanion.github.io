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
// БЕЗОПАСНЫЕ ОБЁРТКИ ДЛЯ LOCALSTORAGE
// (приватный режим Safari / quota exceeded / cookies off)
// ============================================
function safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
}
function safeStorageRemove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}
// Экспонируем для других скриптов (script.js, matcenter.js, bookmarks.js)
if (typeof window !== 'undefined') {
    window.safeStorageGet = safeStorageGet;
    window.safeStorageSet = safeStorageSet;
    window.safeStorageRemove = safeStorageRemove;
}

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
    const saved = safeStorageGet('siteSettings');
    if (saved) {
        try {
            siteSettings = { ...defaultSettings, ...JSON.parse(saved) };
        } catch (e) {
            siteSettings = { ...defaultSettings };
        }
    }
    if (!saved && (('ontouchstart' in window) || window.innerWidth <= 768)) {
        siteSettings.hoverEffects = false;
    }
}

function saveSettings() {
    safeStorageSet('siteSettings', JSON.stringify(siteSettings));
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
    const body = document.body;
    const html = document.documentElement;

    // Race-guard: если предыдущая смена темы ещё не завершилась — игнорируем.
    if (body.dataset.themeBusy === '1') return;
    body.dataset.themeBusy = '1';

    // Отключаем все transitions на момент смены темы — иначе сотни элементов
    // одновременно начинают анимировать цвета и страница лагает.
    body.classList.add('theme-transitioning');

    // Снимаем все возможные классы тем, потом включаем нужный
    body.classList.remove('dark-theme', 'sepia-theme', 'midnight-theme');
    if (theme === 'dark')     body.classList.add('dark-theme');
    if (theme === 'sepia')    body.classList.add('sepia-theme');
    if (theme === 'midnight') body.classList.add('midnight-theme');
    // 'light' — без дополнительного класса (значения из :root)

    // Снимаем inline-стили, выставленные FOUC-скриптом в <head> —
    // теперь цвет полностью контролируется CSS-переменными темы.
    if (html.style.backgroundColor || html.style.color) {
        html.style.backgroundColor = '';
        html.style.color = '';
    }
    html.dataset.theme = theme;

    // Сохраняем для совместимости со старым кодом (и для FOUC-скрипта)
    safeStorageSet('theme', theme);

    // Через 2 кадра отдаём управление — браузер уже применил новые цвета,
    // можно вернуть transitions для пользовательских взаимодействий.
    // setTimeout-fallback на случай если страница в фоне (rAF приостановлен).
    let cleared = false;
    const clearTransitioning = () => {
        if (cleared) return;
        cleared = true;
        body.classList.remove('theme-transitioning');
        delete body.dataset.themeBusy;
    };
    requestAnimationFrame(() => {
        requestAnimationFrame(clearTransitioning);
    });
    setTimeout(clearTransitioning, 250);
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
        button.innerHTML = '<svg class="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
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
        sidebarButton.innerHTML = '<svg class="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
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
    // Inline SVG-иконки (Feather-style, наследуют currentColor)
    const ICONS = {
        settings: `<svg class="settings-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
        palette: `<svg class="settings-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.6 0 1-.4 1-1 0-.3-.1-.5-.3-.7-.2-.2-.3-.4-.3-.7 0-.6.4-1 1-1h2c2.8 0 5-2.2 5-5 0-5-4.5-9.6-8.4-9.6z"/></svg>`,
        sparkles: `<svg class="settings-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75z"/><path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5z"/></svg>`,
        bookOpen: `<svg class="level-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
        moonStars: `<svg class="level-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/><circle cx="5" cy="5" r="0.6" fill="currentColor"/><circle cx="8" cy="2.5" r="0.5" fill="currentColor"/><circle cx="3" cy="10" r="0.4" fill="currentColor"/></svg>`,
        pointer: `<svg class="settings-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11V6a2 2 0 0 1 4 0v6"/><path d="M13 9a2 2 0 0 1 4 0v4"/><path d="M17 11a2 2 0 0 1 4 0v6a5 5 0 0 1-5 5h-3.5a5 5 0 0 1-4.3-2.5L4 14a2 2 0 0 1 3.5-2L9 14"/></svg>`,
        sun: `<svg class="level-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="7" y2="7"/><line x1="17" y1="17" x2="19" y2="19"/><line x1="5" y1="19" x2="7" y2="17"/><line x1="17" y1="7" x2="19" y2="5"/></svg>`,
        moon: `<svg class="level-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`,
        rocket: `<svg class="level-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2c.85-.85.86-2.15.05-3-.81-.85-2.2-.85-3.05 0"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>`,
        zap: `<svg class="level-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        muted: `<svg class="level-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>`,
        refresh: `<svg class="reset-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 1-15.45 6.36L3 16"/><path d="M3 12a9 9 0 0 1 15.45-6.36L21 8"/><polyline points="21 3 21 8 16 8"/><polyline points="3 21 3 16 8 16"/></svg>`,
        tree: `<svg class="settings-section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 6 9h3l-4 5h3l-4 5h16l-4-5h3l-4-5h3z"/><line x1="12" y1="19" x2="12" y2="22"/></svg>`
    };

    modal.innerHTML = `
        <div class="settings-modal-content">
            <div class="settings-modal-header">
                <h2 id="settingsModalTitle"><span class="settings-title-icon">${ICONS.settings}</span>Настройки</h2>
                <button class="settings-close-btn" id="settingsCloseBtn" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg></button>
            </div>

            <div class="settings-modal-body">
                <!-- Тема -->
                <div class="settings-section">
                    <h3>${ICONS.palette}<span>Тема оформления</span></h3>
                    <div class="settings-option">
                        <div class="theme-selector">
                            <button class="theme-option ${siteSettings.theme === 'light' ? 'active' : ''}" data-theme="light">
                                <div class="theme-preview light-preview">
                                    <div class="preview-header"></div>
                                    <div class="preview-content"></div>
                                </div>
                                <span class="theme-option-label">${ICONS.sun}<span>Светлая</span></span>
                            </button>
                            <button class="theme-option ${siteSettings.theme === 'dark' ? 'active' : ''}" data-theme="dark">
                                <div class="theme-preview dark-preview">
                                    <div class="preview-header"></div>
                                    <div class="preview-content"></div>
                                </div>
                                <span class="theme-option-label">${ICONS.moon}<span>Тёмная</span></span>
                            </button>
                            <button class="theme-option ${siteSettings.theme === 'sepia' ? 'active' : ''}" data-theme="sepia">
                                <div class="theme-preview sepia-preview">
                                    <div class="preview-header"></div>
                                    <div class="preview-content"></div>
                                </div>
                                <span class="theme-option-label">${ICONS.bookOpen}<span>Сепия</span></span>
                            </button>
                            <button class="theme-option ${siteSettings.theme === 'midnight' ? 'active' : ''}" data-theme="midnight">
                                <div class="theme-preview midnight-preview">
                                    <div class="preview-header"></div>
                                    <div class="preview-content"></div>
                                </div>
                                <span class="theme-option-label">${ICONS.moonStars}<span>Midnight</span></span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Новогодний вайб (скрыт, код сохранён) -->
                <div class="settings-section" id="nySettingsSection" style="display: none;">
                    <h3>${ICONS.tree}<span>Новогодний вайб</span></h3>
                    <div class="settings-option">
                        <label class="toggle-switch">
                            <input type="checkbox" id="newYearToggle" ${siteSettings.newYearMode ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                            <span class="toggle-label">Включить новогоднее настроение со снегом и украшениями</span>
                        </label>
                        <button class="ny-advanced-settings" id="nyAdvancedBtn" style="margin-top: 0.75rem;">
                            ${ICONS.palette}<span>Дополнительные настройки снега</span>
                        </button>
                    </div>
                </div>

                <!-- Анимации -->
                <div class="settings-section">
                    <h3>${ICONS.sparkles}<span>Уровень анимаций</span></h3>
                    <div class="settings-option">
                        <div class="animation-level-selector">
                            <button class="animation-level-option ${siteSettings.animationLevel === 'max' ? 'active' : ''}" data-level="max">
                                <span class="level-icon">${ICONS.rocket}</span>
                                <span class="level-title">Максимальный</span>
                                <span class="level-desc">Все анимации и эффекты</span>
                            </button>
                            <button class="animation-level-option ${siteSettings.animationLevel === 'medium' ? 'active' : ''}" data-level="medium">
                                <span class="level-icon">${ICONS.zap}</span>
                                <span class="level-title">Средний</span>
                                <span class="level-desc">Основные анимации</span>
                            </button>
                            <button class="animation-level-option ${siteSettings.animationLevel === 'off' ? 'active' : ''}" data-level="off">
                                <span class="level-icon">${ICONS.muted}</span>
                                <span class="level-title">Выключено</span>
                                <span class="level-desc">Без анимаций (быстрее)</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Hover-эффекты -->
                <div class="settings-section">
                    <h3>${ICONS.pointer}<span>Hover-эффекты</span></h3>
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
                        ${ICONS.refresh}<span>Сбросить всё</span>
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
    if (!modal) return;

    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    // A11y
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'settingsModalTitle');

    const newYearToggle = document.getElementById('newYearToggle');
    if (newYearToggle && typeof isNewYearMode !== 'undefined') {
        newYearToggle.checked = isNewYearMode;
    }
    const hoverToggle = document.getElementById('hoverToggle');
    if (hoverToggle) {
        hoverToggle.checked = siteSettings.hoverEffects;
    }

    // Запоминаем элемент, с которого открыли — вернём фокус при закрытии
    settingsModalReturnFocus = document.activeElement;
    // Фокус на первой кнопке внутри модалки
    const firstFocusable = modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) firstFocusable.focus();
}

let settingsModalReturnFocus = null;

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.classList.add('hidden');
    document.body.classList.remove('modal-open');
    // Возвращаем фокус на исходный элемент (кнопка настроек)
    if (settingsModalReturnFocus && typeof settingsModalReturnFocus.focus === 'function') {
        try { settingsModalReturnFocus.focus(); } catch (_) {}
    }
    settingsModalReturnFocus = null;
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
