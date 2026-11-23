// ============================================
// СИСТЕМА НАСТРОЕК САЙТА
// ============================================

// Настройки по умолчанию
const VISUAL_DEFAULTS_VERSION = 1;
const NOTE_SCALE_MIN = 0.75;
const NOTE_SCALE_MAX = 1.25;

function systemPrefersDark() {
    return typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function normalizeNoteScale(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.min(NOTE_SCALE_MAX, Math.max(NOTE_SCALE_MIN, Math.round(numeric * 100) / 100));
}

function isNoteReadingPage() {
    return !!document.body?.dataset.noteSubject && !!document.querySelector('.main-content');
}

const defaultSettings = {
    theme: systemPrefersDark() ? 'dark' : 'light',
    newYearMode: false,
    animationLevel: 'max',
    hoverEffects: true,
    // Новый интерфейс (внутреннее имя experimental сохранено для совместимости)
    experimental: true,
    readerLayout: 'sections',
    expMode: 'prism',      // 'graphite' | 'prism' | 'sepia'
    expTheme: 'system',    // 'system' | 'light' | 'dark'
    expDark: systemPrefersDark(), // resolved value kept for early page rendering
    noteScale: 1,
    matcenterSolvedAnimation: 'circle', // 'circle' | 'strike'
    visualDefaultsVersion: VISUAL_DEFAULTS_VERSION
};

function migrateVisualDefaults(value) {
    const normalized = window.AlmanionThemeBootstrap.normalize(value || {});
    return { ...defaultSettings, ...normalized, noteScale: normalizeNoteScale(normalized.noteScale) };
}

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
// Экспонируем для других скриптов (script.js, модули matcenter/, bookmarks.js)
if (typeof window !== 'undefined') {
    window.safeStorageGet = safeStorageGet;
    window.safeStorageSet = safeStorageSet;
    window.safeStorageRemove = safeStorageRemove;
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

function initializeSettingsSystem() {
    if (window.AlmanionSettings && window.AlmanionSettings.ready) return;
    loadSettings();
    applyAllSettings();
    initSystemThemeSync();
    initSettingsButton();
    createSettingsModal();
    window.AlmanionSettings.ready = true;
    window.dispatchEvent(new CustomEvent('almanion-settings-ready', {
        detail: { settings: { ...siteSettings } }
    }));
}

// ============================================
// ЗАГРУЗКА И СОХРАНЕНИЕ НАСТРОЕК
// ============================================

function loadSettings() {
    siteSettings = migrateVisualDefaults(window.AlmanionThemeBootstrap.ensureSettings());
    window.siteSettings = siteSettings;
}

function saveSettings(options = {}) {
    safeStorageSet('siteSettings', JSON.stringify(siteSettings));
    const updatedAt = Date.now();
    safeStorageSet('almanion_site_settings_updated_at', String(updatedAt));
    if (!options.silent) {
        window.dispatchEvent(new CustomEvent('almanion-settings-changed', {
            detail: { settings: { ...siteSettings }, updatedAt }
        }));
    }
}

function updateSettings(patch, options = {}) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return { ...siteSettings };
    }
    const merged = { ...siteSettings, ...patch };
    if ('experimental' in patch && !('readerLayout' in patch)) merged.readerLayout = patch.experimental ? 'sections' : 'feed';
    siteSettings = migrateVisualDefaults(merged);
    window.siteSettings = siteSettings;
    saveSettings();
    if (options.apply !== false) applyAllSettings();
    refreshSettingsControls();
    return { ...siteSettings };
}

function applySyncedSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    siteSettings = migrateVisualDefaults(value);
    window.siteSettings = siteSettings;
    saveSettings({ silent: true });
    applyAllSettings();
    window.dispatchEvent(new CustomEvent('almanion-settings-applied', {
        detail: { settings: { ...siteSettings }, source: 'sync' }
    }));

    refreshSettingsControls();
}

// ============================================
// ПРИМЕНЕНИЕ НАСТРОЕК
// ============================================

function applyAllSettings() {
    applyExperimental();
    applyReaderLayout();
    applyAnimationLevel(siteSettings.animationLevel);
    applyHoverEffects(siteSettings.hoverEffects);
    applyNoteScale(siteSettings.noteScale);
    applyMatcenterSolvedAnimation();
}

// Применяем экспериментальный режим (новый дизайн).
// body.experimental + body.exp-graphite|exp-prism + (body.exp-dark для тёмной).
function applyExperimental() {
    const body = document.body;
    body.classList.add('exp-switching');
    window.AlmanionThemeBootstrap.applyEarlyTheme(siteSettings);
    window.AlmanionThemeBootstrap.applyBody(siteSettings);
    safeStorageSet('theme', siteSettings.expDark ? 'dark' : 'light');

    // Возвращаем переходы через 2 кадра (когда новые цвета уже применены),
    // + setTimeout-фоллбэк на случай фоновой вкладки (rAF приостановлен).
    let cleared = false;
    const clear = () => { if (cleared) return; cleared = true; body.classList.remove('exp-switching'); };
    requestAnimationFrame(() => requestAnimationFrame(clear));
    setTimeout(clear, 260);
}

function applyReaderLayout() {
    if (!document.body.hasAttribute('data-reader-layout')) return;
    document.body.dataset.readerLayout = siteSettings.readerLayout;
    window.dispatchEvent(new CustomEvent('experimental-mode-changed', {
        detail: { enabled: true, readerLayout: siteSettings.readerLayout }
    }));
}

function initSystemThemeSync() {
    window.addEventListener('almanion-system-theme-changed', event => {
        if (siteSettings.expTheme !== 'system') return;
        siteSettings.expDark = !!event.detail.dark;
        applyExperimental();
        saveSettings();
    });
}

function applyHoverEffects(enabled) {
    // Эта настройка относится только к спокойному чтению конспекта. На главной,
    // в меню, настройках и служебных страницах обычная обратная связь остаётся.
    document.body.classList.toggle('no-hover', !enabled && isNoteReadingPage());
}

function applyNoteScale(value) {
    const scale = normalizeNoteScale(value);
    siteSettings.noteScale = scale;
    document.documentElement.style.setProperty('--note-scale', String(scale));
    document.body.dataset.noteScale = String(Math.round(scale * 100));
}

let themeTransitionGeneration = 0;
let activeThemeTransition = null;

/**
 * Меняет цветовую тему одним композитным cross-fade. Так браузер не запускает
 * сотни отдельных transition у карточек и формул, а частые клики всегда
 * применяют последний выбор пользователя.
 */
function animateThemeChange(update, livePreviewModal) {
    const reduceMotion = document.body.classList.contains('animations-off')
        || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
        update();
        return;
    }

    const generation = ++themeTransitionGeneration;
    if (activeThemeTransition && typeof activeThemeTransition.skipTransition === 'function') {
        activeThemeTransition.skipTransition();
    }

    // A document snapshot can freeze the SVG halfway through a sunrise in WebKit.
    if (!livePreviewModal && typeof document.startViewTransition === 'function') {
        document.documentElement.classList.add('site-theme-transition');
        const transition = document.startViewTransition(update);
        activeThemeTransition = transition;
        transition.finished.catch(() => {}).finally(() => {
            if (generation !== themeTransitionGeneration) return;
            activeThemeTransition = null;
            document.documentElement.classList.remove('site-theme-transition');
        });
        return;
    }

    const previousVeil = document.querySelector('.site-theme-transition-veil');
    if (previousVeil) previousVeil.remove();
    const veil = document.createElement('div');
    veil.className = 'site-theme-transition-veil';
    veil.style.backgroundColor = getComputedStyle(document.body).backgroundColor;
    (livePreviewModal || document.body).prepend(veil);
    update();
    const fade = veil.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    fade.finished.then(() => veil.remove(), () => veil.remove());
}

function applyAnimationLevel(level) {
    // Убираем все классы уровней анимации
    document.body.classList.remove('animations-max', 'animations-medium', 'animations-off');
    
    // Добавляем нужный класс
    document.body.classList.add(`animations-${level}`);
}

function isMatcenterPage() {
    return document.body.classList.contains('matcenter-page') ||
        /(^|\/)matcenter\.html(?:$|[?#])/.test(window.location.pathname);
}

function normalizeMatcenterSolvedAnimation(mode) {
    return mode === 'strike' ? 'strike' : 'circle';
}

function applyMatcenterSolvedAnimation() {
    const mode = normalizeMatcenterSolvedAnimation(siteSettings.matcenterSolvedAnimation);
    siteSettings.matcenterSolvedAnimation = mode;
    if (isMatcenterPage()) {
        document.body.dataset.matcenterSolvedAnimation = mode;
    } else {
        delete document.body.dataset.matcenterSolvedAnimation;
    }
    window.dispatchEvent(new CustomEvent('matcenter-solved-animation-changed', { detail: { mode } }));
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

        (document.getElementById('homeControls') || document.body).appendChild(button);
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

function renderSettingsContents() {
    const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    const device = icon('<rect x="3" y="5" width="18" height="13" rx="2"/><path d="M9 21h6m-3-3v3"/>');
    const sun = icon('<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>');
    const moon = icon('<path d="M20.5 14A8.8 8.8 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/>');
    const prism = icon('<path d="m12 3 9 16H3Z" fill="#a59af7" stroke="none"/><path d="m12 3 1 16h8Z" fill="#707de0" stroke="none"/><path d="m12 3-4 16H3Z" fill="#d3bbf6" stroke="none"/>');
    const graphite = icon('<path d="m12 2 9 5v10l-9 5-9-5V7Z" fill="#8c94a5" stroke="none"/><path d="m3 7 9 5 9-5-9-5Z" fill="#c4c9d1" stroke="none"/><path d="M12 12v10l9-5V7Z" fill="#616978" stroke="none"/>');
    const pages = icon('<path d="M6 4h12a1 1 0 0 1 1 1v12H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 20h13V8M8 8h7m-7 3h4"/>');
    const feed = icon('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8m-8 4h5m-5 4h8"/>');
    const row = (key, label, attribute, options) => `
        <div class="prefs-row">
            <h3 id="${key}">${label}</h3>
            <div class="prefs-choices" role="group" aria-labelledby="${key}" style="--prefs-count: ${options.length}">
                ${options.map(([value, text, preview = '']) => `<button type="button" ${attribute}="${value}" aria-pressed="false">${preview}<span>${text}</span></button>`).join('')}
            </div>
        </div>`;
    return `
        <div class="settings-modal-content">
            <header class="settings-modal-header">
                <div class="prefs-title">
                    <button class="prefs-preview" type="button" aria-label="Повторить анимацию" title="Повторить анимацию">
                        <svg class="prefs-sky" viewBox="0 0 88 48" aria-hidden="true" focusable="false">
                            <rect width="88" height="48" fill="var(--sky-paper)"/>
                            <defs>
                                <linearGradient id="prefsTwilight" x2="0" y2="1" gradientUnits="objectBoundingBox">
                                    <stop stop-color="var(--sky-dusk)" stop-opacity="0"/>
                                    <stop offset=".8" stop-color="var(--sky-dusk)"/>
                                </linearGradient>
                            </defs>
                            <rect class="prefs-twilight" width="88" height="48" fill="url(#prefsTwilight)"/>
                            <g class="prefs-day">
                                <path class="prefs-cloud" d="M13 15h11m-3-4h10" fill="none" stroke="var(--sky-cloud)" stroke-width="2" stroke-linecap="round"/>
                            </g>
                            <g class="prefs-night">
                                <g class="prefs-stars" fill="var(--sky-moon)">
                                    <path d="m19 8 .7 2.2 2.3.8-2.3.8L19 14l-.8-2.2-2.2-.8 2.2-.8Z"/>
                                    <circle cx="35" cy="7" r=".8"/><circle cx="44" cy="14" r="1"/><circle cx="77" cy="17" r=".8"/>
                                </g>
                            </g>
                            <g class="prefs-orbit">
                                <g class="prefs-luminary">
                                    <circle class="prefs-sun" cx="56" cy="9" r="6" fill="var(--sky-sun)"/>
                                    <path class="prefs-moon" d="M58.2 3.1a6.4 6.4 0 1 0 3.9 8.1 5.6 5.6 0 0 1-3.9-8.1Z" fill="var(--sky-moon)"/>
                                </g>
                            </g>
                            <path class="prefs-ridge" fill="var(--sky-far)" d="m-5 34 20-11q3-1 6 1l9 5 17-15q2-2 5 0l25 19 16-7v22H-5Z"/>
                            <g class="prefs-foothill">
                                <path fill="var(--sky-near)" d="M-5 32q17 1 30 7 14-1 30-10t38-8v27H-5Z"/>
                                <defs><path id="prefsTrail" pathLength="100" d="M70 28q-7 3-14 5c-16 4 6 4-2 8l-14 7"/></defs>
                                <use href="#prefsTrail" fill="none" stroke="var(--sky-trail)" stroke-width="1.3" stroke-linecap="round"/>
                                <use class="prefs-trail-light" href="#prefsTrail" stroke="var(--sky-moon)" stroke-width="2.2" fill="none" opacity="0"/>
                            </g>
                        </svg>
                    </button>
                    <h2 id="settingsModalTitle">Настройки</h2>
                </div>
                <button type="button" id="settingsDoneBtn">Готово</button>
            </header>
            <div class="settings-modal-body">
                ${isNoteReadingPage() ? `
                    <section class="prefs-reading" aria-labelledby="prefsScale">
                        <div class="prefs-heading">
                            <h3 id="prefsScale">Масштаб конспекта</h3>
                            <button type="button" data-note-scale-action="reset">Сбросить</button>
                        </div>
                        <div class="prefs-scale">
                            <div class="prefs-track">
                                <input id="noteScaleRange" type="range" min="75" max="125" step="1" aria-labelledby="prefsScale">
                                <div class="prefs-limits" aria-hidden="true"><span>75%</span><span>100%</span><span>125%</span></div>
                            </div>
                            <label class="prefs-number"><input id="noteScaleInput" type="number" min="75" max="125" step="1" inputmode="numeric" aria-label="Масштаб конспекта, %"><span aria-hidden="true">%</span></label>
                        </div>
                        <label class="prefs-hover"><span>Подсветка блоков при наведении</span><input id="hoverToggle" type="checkbox" role="switch"></label>
                    </section>` : ''}
                <div class="prefs-display">
                    <div id="expSubpanel">
                        ${row('prefsTheme', 'Тема', 'data-exp-theme', [['system', 'Авто', device], ['light', 'Светлая', sun], ['dark', 'Тёмная', moon]])}
                        ${row('prefsPalette', 'Палитра', 'data-exp-mode', [
                            ['prism', 'Призма', prism],
                            ['graphite', 'Графит', graphite],
                            ['sepia', 'Сепия', icon('<path d="M5 4h12l3 3v13H5Z" fill="#cfa779" stroke="none"/><path d="M8 9h7m-7 4h9m-9 3h5" stroke="#63452f"/>')]
                        ])}
                    </div>
                    ${row('prefsMotion', 'Анимации', 'data-level', [['max', 'Полные'], ['medium', 'Умеренные'], ['off', 'Минимум']])}
                    ${row('prefsLayout', 'Вид конспектов', 'data-reader-layout', [['sections', 'По разделам', pages], ['feed', 'Общая лента', feed]])}
                    ${isMatcenterPage() ? row('prefsSolved', 'Отметка решённых задач', 'data-solved-animation', [
                        ['circle', 'Кольцо', '<i aria-hidden="true" class="prefs-marker ring">17</i>'],
                        ['strike', 'Зачёркивание', '<i aria-hidden="true" class="prefs-marker strike">17</i>']
                    ]) : ''}
                </div>
                <div class="prefs-tools">
                    <button type="button" id="settingsOfflineButton">${icon('<path d="M12 3v11m-4-4 4 4 4-4M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>')}<span>Конспекты на устройстве</span>${icon('<path d="m9 5 7 7-7 7"/>')}</button>
                    <button type="button" id="settingsResetBtn" aria-controls="prefsResetConfirm" aria-expanded="false">Сбросить настройки</button>
                    <div class="prefs-confirm" id="prefsResetConfirm" role="group" aria-labelledby="prefsResetTitle" hidden>
                        <strong id="prefsResetTitle">Вернуть настройки по умолчанию?</strong>
                        <button type="button" id="prefsCancel">Отмена</button>
                        <button type="button" id="prefsConfirm">Сбросить</button>
                    </div>
                </div>
            </div>
        </div>`;
}

function createSettingsModal() {
    // Проверяем, не создано ли уже модальное окно
    if (document.getElementById('settingsModal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'settingsModal';
    modal.className = 'settings-modal hidden';
    modal.inert = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = renderSettingsContents();
    document.body.appendChild(modal);
    
    // Привязываем обработчики
    bindSettingsHandlers();
    refreshSettingsControls();
    initSettingsSwipe();
}

function refreshSettingsControls() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    const selected = {
        expTheme: siteSettings.expTheme,
        expMode: siteSettings.expMode,
        readerLayout: siteSettings.readerLayout,
        level: siteSettings.animationLevel,
        solvedAnimation: siteSettings.matcenterSolvedAnimation
    };
    modal.querySelectorAll('.prefs-choices').forEach(group => {
        [...group.children].forEach((button, index) => {
            const [key, value] = Object.entries(button.dataset)[0];
            const active = selected[key] === value;
            button.setAttribute('aria-pressed', String(active));
            if (active) group.style.setProperty('--prefs-index', index);
        });
    });
    modal.querySelector('.prefs-preview').disabled = siteSettings.animationLevel === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hover = modal.querySelector('#hoverToggle');
    if (hover) hover.checked = siteSettings.hoverEffects;
    const percent = String(Math.round(normalizeNoteScale(siteSettings.noteScale) * 100));
    const number = modal.querySelector('#noteScaleInput');
    const range = modal.querySelector('#noteScaleRange');
    const resetScale = modal.querySelector('[data-note-scale-action="reset"]');
    if (resetScale) resetScale.disabled = percent === '100';
    if (number && document.activeElement !== number) number.value = percent;
    if (range) {
        range.value = percent;
        range.setAttribute('aria-valuetext', percent + '%');
    }
}

function playSettingsPreview(modal) {
    const preview = modal.querySelector('.prefs-preview');
    preview.classList.remove('playing');
    if (preview.disabled || modal.inert) return;
    // Restart the short scene even when the same choice was pressed again.
    preview.getBoundingClientRect();
    preview.classList.add('playing');
}

function bindPreferenceChoices(modal) {
    const preview = modal.querySelector('.prefs-preview');
    preview.addEventListener('click', () => playSettingsPreview(modal));
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refreshSettingsControls);
    modal.querySelector('.prefs-display').addEventListener('click', event => {
        const button = event.target.closest('.prefs-choices button');
        if (!button) return;
        if (button.getAttribute('aria-pressed') === 'true') {
            if (button.dataset.level) playSettingsPreview(modal);
            return;
        }
        const { expTheme, expMode, readerLayout, level, solvedAnimation } = button.dataset;
        if (readerLayout) {
            siteSettings.readerLayout = readerLayout;
            applyReaderLayout();
            refreshSettingsControls();
            saveSettings();
            return;
        }
        if (level || solvedAnimation) {
            if (level) {
                siteSettings.animationLevel = level;
                applyAnimationLevel(level);
            } else {
                siteSettings.matcenterSolvedAnimation = solvedAnimation;
                applyMatcenterSolvedAnimation();
            }
            refreshSettingsControls();
            if (level) playSettingsPreview(modal);
            saveSettings();
            return;
        }
        animateThemeChange(() => {
            if (expTheme) siteSettings.expTheme = expTheme;
            if (expMode) siteSettings.expMode = expMode;
            siteSettings.expDark = window.AlmanionThemeBootstrap.normalize(siteSettings).expDark;
            applyExperimental();
            refreshSettingsControls();
            playSettingsPreview(modal);
            saveSettings();
        }, expTheme ? modal : null);
    });
}

function setResetConfirmation(open) {
    const reset = document.getElementById('settingsResetBtn');
    reset.setAttribute('aria-expanded', String(open));
    reset.hidden = open;
    document.getElementById('prefsResetConfirm').hidden = !open;
}

function bindSettingsHandlers() {
    document.getElementById('settingsOfflineButton').addEventListener('click', async function () {
        this.disabled = true;
        try {
            if (window.AlmanionNoteRuntime) await window.AlmanionNoteRuntime.ensure('offline');
            else {
                if (!document.querySelector('link[data-reader-tools]')) {
                    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = 'styles/reader-tools.css?v=20261002-2'; style.dataset.readerTools = 'true'; document.head.append(style);
                }
                if (!window.AlmanionOffline) await new Promise((resolve, reject) => {
                    const script = document.createElement('script'); script.src = 'offline-library.js?v=20261002-2'; script.onload = resolve; script.onerror = () => { script.remove(); reject(new Error('Загрузки недоступны')); }; document.head.append(script);
                });
            }
            closeSettingsModal();
            await window.AlmanionOffline.open();
        } catch (_) {
            const message = document.body.dataset.uiLanguage === 'en'
                ? 'Could not open offline notes. Try again.'
                : 'Не удалось открыть загрузки. Повторите попытку.';
            showNotification(message);
        }
        finally { this.disabled = false; }
    });
    // Закрытие модального окна
    const modal = document.getElementById('settingsModal');
    
    document.getElementById('settingsDoneBtn').addEventListener('click', closeSettingsModal);
    
    // Закрытие по клику на фон
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeSettingsModal();
        }
    });
    
    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeSettingsModal();
        } else if (event.key === 'Tab') {
            const controls = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(el => el.getClientRects().length);
            const first = controls[0], last = controls[controls.length - 1];
            if (document.activeElement === (event.shiftKey ? first : last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        }
    });
    bindPreferenceChoices(modal);

    // Отклик курсора
    const hoverToggle = document.getElementById('hoverToggle');
    if (hoverToggle) {
        hoverToggle.addEventListener('change', (e) => {
            siteSettings.hoverEffects = e.target.checked;
            applyHoverEffects(e.target.checked);
            saveSettings();
        });
    }

    const noteScaleInput = document.getElementById('noteScaleInput');
    const noteScaleRange = document.getElementById('noteScaleRange');
    const setNoteScalePercent = (rawValue, persist = true) => {
        const numeric = Number(rawValue);
        if (rawValue === '' || !Number.isFinite(numeric)) return false;
        const percent = Math.min(NOTE_SCALE_MAX * 100, Math.max(NOTE_SCALE_MIN * 100, Math.round(numeric)));
        siteSettings.noteScale = normalizeNoteScale(percent / 100);
        applyNoteScale(siteSettings.noteScale);
        refreshSettingsControls();
        if (persist) saveSettings();
        return true;
    };
    noteScaleRange?.addEventListener('input', event => setNoteScalePercent(event.target.value, false));
    noteScaleRange?.addEventListener('change', () => saveSettings());
    noteScaleInput?.addEventListener('input', event => {
        const value = Number(event.target.value);
        if (Number.isFinite(value) && value >= NOTE_SCALE_MIN * 100 && value <= NOTE_SCALE_MAX * 100) {
            setNoteScalePercent(value, false);
        }
    });
    noteScaleInput?.addEventListener('change', event => {
        setNoteScalePercent(event.target.value);
        event.target.value = String(Math.round(siteSettings.noteScale * 100));
    });
    noteScaleInput?.addEventListener('blur', () => { noteScaleInput.value = String(Math.round(siteSettings.noteScale * 100)); });
    modal.querySelector('[data-note-scale-action="reset"]')?.addEventListener('click', () => {
        setNoteScalePercent(100);
        noteScaleRange.focus();
    });
    const resetBtn = modal.querySelector('#settingsResetBtn');
    resetBtn.addEventListener('click', () => {
        setResetConfirmation(true);
        modal.querySelector('#prefsCancel').focus();
    });
    const dismissReset = () => {
        setResetConfirmation(false);
        resetBtn.focus();
    };
    modal.querySelector('#prefsCancel').addEventListener('click', dismissReset);
    modal.querySelector('#prefsConfirm').addEventListener('click', () => {
        resetAllSettings();
        dismissReset();
    });
}

// ============================================
// ОТКРЫТИЕ/ЗАКРЫТИЕ МОДАЛЬНОГО ОКНА
// ============================================

function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal || !modal.inert) return;
    refreshSettingsControls();
    setResetConfirmation(false);

    modal.classList.remove('hidden');
    modal.inert = false;
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    // A11y
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'settingsModalTitle');

    modal.querySelector('.settings-modal-body').scrollTop = 0;

    // Запоминаем элемент, с которого открыли — вернём фокус при закрытии
    settingsModalReturnFocus = document.activeElement;
    // Фокус на первой кнопке внутри модалки
    const firstFocusable = modal.querySelector('#settingsDoneBtn');
    if (firstFocusable) firstFocusable.focus({ preventScroll: true });
    playSettingsPreview(modal);
}

let settingsModalReturnFocus = null;

function closeSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.inert = true;
    modal.querySelector('.prefs-preview').classList.remove('playing');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    // Возвращаем фокус на исходный элемент (кнопка настроек)
    if (settingsModalReturnFocus && typeof settingsModalReturnFocus.focus === 'function') {
        try { settingsModalReturnFocus.focus({ preventScroll: true }); } catch (_) {}
    }
    settingsModalReturnFocus = null;
}

// ============================================
// СБРОС НАСТРОЕК
// ============================================

function resetAllSettings() {
    siteSettings = { ...defaultSettings, expDark: systemPrefersDark() };
    window.siteSettings = siteSettings;
    applyAllSettings();
    if (typeof isNewYearMode !== 'undefined' && isNewYearMode && typeof toggleNewYearMode === 'function') toggleNewYearMode();
    safeStorageSet('newYearMode', false);
    saveSettings();
    refreshSettingsControls();
}

// ============================================
// УВЕДОМЛЕНИЯ
// ============================================

function showNotification(message) {
    if (window.AlmanionToast) {
        window.AlmanionToast.show(message, { type: 'info' });
        return;
    }
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
        tracking = false;
        if (!window.matchMedia('(max-width: 600px)').matches || e.touches.length !== 1) return;
        // The body scrolls independently; dragging its controls must not dismiss the sheet.
        if (!e.target.closest('.settings-modal-header') || e.target.closest('button')) return;
        const content = getContent();
        if (!content) return;
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

    modal.addEventListener('touchcancel', () => {
        tracking = false;
        activated = false;
        const content = getContent();
        content.style.transition = '';
        content.style.transform = '';
        modal.style.background = '';
    });

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

// ============================================
// ЭКСПОРТ ДЛЯ СОВМЕСТИМОСТИ
// ============================================

window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.siteSettings = siteSettings;
window.AlmanionSettings = {
    ready: false,
    get: () => ({ ...siteSettings }),
    update: updateSettings,
    applySynced: applySyncedSettings,
    migrateVisualDefaults,
    visualDefaultsVersion: VISUAL_DEFAULTS_VERSION
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSettingsSystem, { once: true });
} else {
    initializeSettingsSystem();
}

console.log('⚙️ Система настроек загружена');
