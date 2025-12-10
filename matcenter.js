// ============================================
// CONFIGURATION
// ============================================

// Encoded endpoint URL (base64)
const _0x4e2a = ['aHR0cHM6Ly9zY3JpcHQuZ29vZ2xlLmNvbS9tYWNyb3Mvcy9BS2Z5Y2J4X2FPWTI3ZThNSTY3Q1lxYWFHeDdjWnpJRjhwdmpTUXV6OUY5UWtGbmRpMndWX0JPLUl3NWJMdEZ3QndpbGo5enovZXhlYw=='];
const _0x1f3b = (s) => atob(s);
const API_ENDPOINT = _0x1f3b(_0x4e2a[0]);

// Security settings
const MAX_FAILED_ATTEMPTS = 3;
const LOCKOUT_DURATION = 5 * 60 * 1000; // 5 минут в миллисекундах

let allTasks = [];
let currentFilter = 'all';
let authToken = null;
let lockoutTimer = null;

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('=================================');
    console.log('🚀 МатЦентр инициализация');
    console.log('=================================');
    
    // Проверяем, есть ли сохранённый пароль
    const savedPassword = localStorage.getItem('matcenter_auth');
    console.log('🔑 Сохранённый пароль:', savedPassword ? 'найден ✅' : 'не найден ❌');
    
    if (savedPassword) {
        authToken = savedPassword;
        // Сразу скрываем форму и показываем меню
        hideAuthForm();
        
        try {
            // Пробуем загрузить данные с сохранённым паролем
            console.log('🔄 Попытка загрузки с сохранённым паролем...');
            await loadTasksFromGoogleSheets();
            console.log('✅ Загрузка успешна! Пользователь авторизован.');
        } catch (error) {
            // Если ошибка (например, пароль изменился) - показываем форму входа обратно
            console.warn('⚠️ Сохранённый пароль недействителен:', error.message);
            authToken = null;
            localStorage.removeItem('matcenter_auth');
            showAuthForm();
        }
    } else {
        console.log('📋 Показываем форму авторизации...');
        showAuthForm();
    }
    
    initMatCenterNavigation();
    initMatCenterSearch();
    initAuth();
    
    // Кнопка обновления в заголовке
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            refreshButton.disabled = true;
            refreshButton.textContent = '⏳ Обновление...';
            
            loadTasksFromGoogleSheets()
                .catch(err => {
                    console.error('Ошибка обновления данных:', err);
                    alert('Не удалось обновить данные. Проверьте соединение.');
                })
                .finally(() => {
                    refreshButton.disabled = false;
                    refreshButton.textContent = '🔄 Обновить данные';
                });
        });
    }
    
    // Автообновление каждые 5 минут (только если авторизован)
    setInterval(() => {
        if (authToken) {
            loadTasksFromGoogleSheets().catch(err => {
                console.error('Ошибка автообновления:', err);
                // При ошибке автообновления не разлогиниваем пользователя
            });
        }
    }, 5 * 60 * 1000);
});

// ============================================
// SECURITY & LOCKOUT
// ============================================

function getFailedAttempts() {
    return parseInt(localStorage.getItem('matcenter_failed_attempts') || '0');
}

function setFailedAttempts(count) {
    localStorage.setItem('matcenter_failed_attempts', count.toString());
}

function getLockoutUntil() {
    return parseInt(localStorage.getItem('matcenter_lockout_until') || '0');
}

function setLockoutUntil(timestamp) {
    localStorage.setItem('matcenter_lockout_until', timestamp.toString());
}

function isLockedOut() {
    const lockoutUntil = getLockoutUntil();
    if (lockoutUntil > Date.now()) {
        return true;
    }
    // Если время блокировки истекло, сбрасываем
    if (lockoutUntil > 0) {
        setLockoutUntil(0);
        setFailedAttempts(0);
    }
    return false;
}

function getRemainingLockoutTime() {
    const lockoutUntil = getLockoutUntil();
    const remaining = lockoutUntil - Date.now();
    return remaining > 0 ? remaining : 0;
}

function startLockout() {
    const lockoutUntil = Date.now() + LOCKOUT_DURATION;
    setLockoutUntil(lockoutUntil);
    console.warn('🔒 Блокировка активирована на 5 минут');
}

function resetFailedAttempts() {
    setFailedAttempts(0);
    setLockoutUntil(0);
    console.log('✅ Счётчик неудачных попыток сброшен');
}

function updateLockoutUI() {
    const authError = document.getElementById('authError');
    const passwordInput = document.getElementById('passwordInput');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit?.querySelector('.submit-text');
    const submitSpinner = authSubmit?.querySelector('.submit-spinner');
    
    if (isLockedOut()) {
        const remaining = getRemainingLockoutTime();
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        
        if (authError) {
            authError.style.display = 'flex';
            authError.querySelector('.error-icon').textContent = '⏱️';
            authError.querySelector('.error-text').textContent = 
                `Слишком много попыток. Повторите через ${minutes}:${seconds.toString().padStart(2, '0')}`;
        }
        
        if (passwordInput) passwordInput.disabled = true;
        if (authSubmit) {
            authSubmit.disabled = true;
            if (submitText) submitText.textContent = 'Заблокировано';
        }
        
        return true;
    } else {
        if (passwordInput) passwordInput.disabled = false;
        if (authSubmit) {
            authSubmit.disabled = false;
            if (submitText) submitText.textContent = 'Войти';
        }
        return false;
    }
}

// ============================================
// АВТОРИЗАЦИЯ
// ============================================

function initAuth() {
    const authForm = document.getElementById('authForm');
    const passwordInput = document.getElementById('passwordInput');
    const authError = document.getElementById('authError');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit.querySelector('.submit-text');
    const submitSpinner = authSubmit.querySelector('.submit-spinner');
    const authModal = document.getElementById('authModal');
    const logoutButton = document.getElementById('logoutButton');
    
    // Проверка блокировки при загрузке
    if (isLockedOut()) {
        updateLockoutUI();
        // Запускаем таймер обновления
        lockoutTimer = setInterval(() => {
            if (!updateLockoutUI()) {
                // Блокировка снята
                clearInterval(lockoutTimer);
                lockoutTimer = null;
            }
        }, 1000);
    }
    
    // Форма входа
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Проверяем блокировку
        if (isLockedOut()) {
            updateLockoutUI();
            return;
        }
        
        const password = passwordInput.value;
        
        // Скрываем ошибку
        authError.style.display = 'none';
        
        // Показываем спиннер
        submitText.style.display = 'none';
        submitSpinner.style.display = 'flex';
        authSubmit.disabled = true;
        passwordInput.disabled = true;
        
        // Пробуем загрузить данные с этим паролем
        try {
            authToken = password;
            await loadTasksFromGoogleSheets();
            
            // Если успешно - сбрасываем счётчик и сохраняем пароль
            resetFailedAttempts();
            localStorage.setItem('matcenter_auth', password);
            hideAuthForm();
            
        } catch (error) {
            // Если ошибка - увеличиваем счётчик неудачных попыток
            authToken = null;
            
            const failedAttempts = getFailedAttempts() + 1;
            setFailedAttempts(failedAttempts);
            
            console.warn(`⚠️ Неудачная попытка входа: ${failedAttempts}/${MAX_FAILED_ATTEMPTS}`);
            
            // Анимация тряски
            authModal.classList.add('shake');
            setTimeout(() => {
                authModal.classList.remove('shake');
            }, 400);
            
            // Проверяем, нужно ли блокировать
            if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
                startLockout();
                updateLockoutUI();
                
                // Запускаем таймер обновления
                if (lockoutTimer) clearInterval(lockoutTimer);
                lockoutTimer = setInterval(() => {
                    if (!updateLockoutUI()) {
                        clearInterval(lockoutTimer);
                        lockoutTimer = null;
                    }
                }, 1000);
            } else {
                // Показываем обычную ошибку
                authError.style.display = 'flex';
                authError.querySelector('.error-icon').textContent = '🚫';
                authError.querySelector('.error-text').textContent = 
                    `Неверный пароль. Осталось попыток: ${MAX_FAILED_ATTEMPTS - failedAttempts}`;
                
                // Возвращаем кнопку в исходное состояние
                submitText.style.display = 'inline';
                submitSpinner.style.display = 'none';
                authSubmit.disabled = false;
                passwordInput.disabled = false;
            }
            
            // Очищаем и фокусируем поле
            passwordInput.value = '';
            if (!isLockedOut()) {
                passwordInput.focus();
            }
        }
    });
    
    // Кнопка выхода
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            if (confirm('Вы уверены, что хотите выйти из МатЦентра?')) {
                logout();
            }
        });
    }
}

function showAuthForm() {
    console.log('📋 showAuthForm() вызвана');
    
    const authOverlay = document.getElementById('authOverlay');
    const logoutSection = document.getElementById('logoutSection');
    const passwordInput = document.getElementById('passwordInput');
    const authError = document.getElementById('authError');
    const authSubmit = document.getElementById('authSubmit');
    const submitText = authSubmit?.querySelector('.submit-text');
    const submitSpinner = authSubmit?.querySelector('.submit-spinner');
    
    if (authOverlay) {
        authOverlay.classList.remove('hidden');
        console.log('✅ Форма авторизации показана');
    }
    
    // Очищаем поле пароля
    if (passwordInput) {
        passwordInput.value = '';
    }
    
    // Возвращаем кнопку в нормальное состояние
    if (submitText && submitSpinner && authSubmit) {
        submitText.style.display = 'inline';
        submitSpinner.style.display = 'none';
    }
    
    // Проверяем блокировку
    if (isLockedOut()) {
        console.warn('⚠️ Форма заблокирована из-за предыдущих неудачных попыток');
        updateLockoutUI();
        
        // Запускаем таймер обновления
        if (lockoutTimer) clearInterval(lockoutTimer);
        lockoutTimer = setInterval(() => {
            if (!updateLockoutUI()) {
                clearInterval(lockoutTimer);
                lockoutTimer = null;
                // После снятия блокировки фокусируем поле
                if (passwordInput) passwordInput.focus();
            }
        }, 1000);
    } else {
        // Скрываем ошибку
        if (authError) {
            authError.style.display = 'none';
        }
        
        if (passwordInput) {
            passwordInput.disabled = false;
            setTimeout(() => {
                passwordInput.focus();
            }, 200);
        }
        
        if (authSubmit) {
            authSubmit.disabled = false;
        }
    }
    
    if (logoutSection) {
        logoutSection.style.display = 'none';
        console.log('✅ Кнопка "Выйти" скрыта');
    }
}

function hideAuthForm() {
    console.log('📋 hideAuthForm() вызвана');
    
    const authOverlay = document.getElementById('authOverlay');
    const logoutSection = document.getElementById('logoutSection');
    
    // Останавливаем таймер блокировки
    if (lockoutTimer) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
    }
    
    if (authOverlay) {
        authOverlay.classList.add('hidden');
        console.log('✅ Форма авторизации скрыта');
    }
    
    if (logoutSection) {
        logoutSection.style.display = 'block';
        console.log('✅ Кнопка "Выйти" показана');
    }
}

function logout() {
    authToken = null;
    localStorage.removeItem('matcenter_auth');
    
    // Очищаем данные
    allTasks = [];
    document.getElementById('tasksContainer').innerHTML = '';
    document.getElementById('currentSeriesContainer').innerHTML = '';
    document.getElementById('postponedContainer').innerHTML = '';
    document.getElementById('unsolvedContainer').innerHTML = '';
    
    // Сбрасываем статистику
    document.getElementById('totalTasks').textContent = '0';
    document.getElementById('solvedTasks').textContent = '0';
    document.getElementById('currentSeries').textContent = '0';
    document.getElementById('postponedTasks').textContent = '0';
    
    showAuthForm();
}

// ============================================
// DATA FETCHING
// ============================================

async function loadTasksFromGoogleSheets() {
    const loadingMessage = document.getElementById('loadingMessage');
    const tasksContainer = document.getElementById('tasksContainer');
    
    // Показываем сообщение о загрузке и очищаем предыдущие ошибки
    if (loadingMessage) {
        loadingMessage.style.display = 'block';
        loadingMessage.innerHTML = `
            <div class="spinner"></div>
            <p>Загрузка задач...</p>
        `;
    }
    
    console.log('=================================');
    console.log('🚀 Начало загрузки данных');
    console.log('Endpoint:', API_ENDPOINT ? 'настроен ✅' : 'не настроен ❌');
    console.log('=================================');
    
    try {
        let tasks = [];
        
        // Загружаем данные с проверкой пароля
        console.log('📍 Метод загрузки: Авторизованный доступ');
        console.log('Endpoint:', API_ENDPOINT.substring(0, 30) + '...');
        tasks = await loadFromAppsScript();
        
        console.log('=================================');
        console.log('📊 РЕЗУЛЬТАТ ЗАГРУЗКИ:');
        console.log('Задач загружено:', tasks.length);
        console.log('Статусы:', {
            'Р (разобрано)': tasks.filter(t => t.status === 'Р').length,
            'Н (текущая серия)': tasks.filter(t => t.status === 'Н').length,
            'П (отложены с подсказкой)': tasks.filter(t => t.status === 'П').length,
            'От (откладыши)': tasks.filter(t => t.status === 'От').length
        });
        console.log('=================================');
        
        if (tasks.length === 0) {
            throw new Error('Не удалось загрузить задачи - пустой массив');
        }
        
        allTasks = tasks;
        
        // Детальная статистика по загруженным задачам
        console.log('=================================');
        console.log('📋 ДЕТАЛЬНЫЙ СПИСОК ЗАДАЧ:');
        const tasksByStatus = {
            'Р': tasks.filter(t => t.status === 'Р'),
            'Н': tasks.filter(t => t.status === 'Н'),
            'П': tasks.filter(t => t.status === 'П'),
            'От': tasks.filter(t => t.status === 'От'),
            'Другие': tasks.filter(t => !['Р', 'Н', 'П', 'От'].includes(t.status))
        };
        
        for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
            if (statusTasks.length > 0) {
                console.log(`${status}: ${statusTasks.length} задач`);
                console.log('  Примеры:', statusTasks.slice(0, 3).map(t => `#${t.number} (${t.status})`).join(', '));
            }
        }
        console.log('=================================');
        
        displayTasks(tasks);
        updateStatistics(tasks);
        
        // Скрываем сообщение о загрузке и очищаем его содержимое
        if (loadingMessage) {
            loadingMessage.style.display = 'none';
            loadingMessage.innerHTML = ''; // Очищаем содержимое
        }
        
        console.log('✅ УСПЕХ! Данные отображены на странице');
        
    } catch (error) {
        console.error('=================================');
        console.error('❌ ОШИБКА ЗАГРУЗКИ:');
        console.error('Тип:', error.name);
        console.error('Сообщение:', error.message);
        console.error('Стек:', error.stack);
        console.error('=================================');
        
        // Скрываем сообщение загрузки
        if (loadingMessage) {
            loadingMessage.style.display = 'none';
        }
        
        // Пробрасываем ошибку дальше (для обработки в initAuth)
        throw error;
    }
}

// ============================================
// DATA LOADING
// ============================================

async function loadFromAppsScript() {
    console.log('🔵 Загрузка данных с сервера...');
    
    // Передаём авторизационный токен
    const url = `${API_ENDPOINT}?password=${encodeURIComponent(authToken)}`;
    const response = await fetch(url);
    
    console.log('📡 Ответ получен, статус:', response.status);
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    console.log('📄 Сырой ответ (первые 500 символов):', text.substring(0, 500));
    
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        console.error('❌ Ошибка парсинга JSON:', e);
        console.log('Полный ответ:', text);
        throw new Error('Не удалось распарсить ответ от сервера');
    }
    
    console.log('📊 Данные распарсены:', data);
    
    if (!data.success) {
        console.error('❌ Сервер вернул ошибку:', data.error);
        throw new Error(data.error || 'Ошибка загрузки данных');
    }
    
    console.log('✅ Сервер вернул задач:', data.count);
    console.log('Первая задача:', data.tasks[0]);
    
    // Логируем уникальные статусы
    const uniqueStatuses = [...new Set(data.tasks.map(t => t.status))];
    console.log('🏷️ Уникальные статусы в данных:', uniqueStatuses);
    console.log('Примеры задач по статусам:');
    uniqueStatuses.forEach(status => {
        const example = data.tasks.find(t => t.status === status);
        console.log(`  "${status}" (длина: ${status.length}, коды: ${[...status].map(c => c.charCodeAt(0)).join(',')})`, 
                    '- Пример:', example ? `#${example.number}` : 'нет');
    });
    
    // Преобразуем данные в нужный формат
    const tasks = data.tasks.map(task => {
        const cleanNumber = extractNumber(task.number);
        return {
            number: cleanNumber,
            numberText: task.number,
            status: task.status.trim(), // Дополнительный trim на всякий случай
            description: task.description || 'Условие не указано'
        };
    });
    
    console.log('🎉 Преобразовано задач:', tasks.length);
    
    return tasks;
}

// Извлечение номера из текста типа "98 (ЛЗ 36)"
function extractNumber(text) {
    const match = text.match(/^(\d+)/);
    return match ? parseInt(match[1]) : null;
}

// ============================================
// ОТОБРАЖЕНИЕ ЗАДАЧ
// ============================================

function displayTasks(tasks, containerId = 'tasksContainer') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`⚠️ Контейнер ${containerId} не найден!`);
        return;
    }
    
    if (tasks.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Задачи не найдены</p>';
        return;
    }
    
    console.log(`📦 Отображение ${tasks.length} задач в контейнере ${containerId}`);
    
    // Статистика по статусам отображаемых задач
    const statusCounts = {};
    tasks.forEach(t => {
        statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    });
    console.log('Статусы отображаемых задач:', statusCounts);
    
    // Сортировка задач по номеру
    const sortedTasks = [...tasks].sort((a, b) => a.number - b.number);
    
    container.innerHTML = '';
    
    let addedCount = 0;
    sortedTasks.forEach((task, index) => {
        try {
            const taskElement = createTaskElement(task);
            container.appendChild(taskElement);
            addedCount++;
        } catch (error) {
            console.error(`❌ Ошибка при создании элемента для задачи #${task.number} (индекс ${index}):`, error);
        }
    });
    
    console.log(`✅ Добавлено в DOM: ${addedCount} из ${sortedTasks.length} задач`);
    
    // Проверим реальное количество элементов в контейнере
    const actualCount = container.querySelectorAll('.task-card').length;
    console.log(`🔍 Реальное количество .task-card в DOM: ${actualCount}`);
}

function createTaskElement(task) {
    // Валидация данных задачи
    if (!task || !task.number) {
        console.warn('⚠️ Пропускаем задачу без номера:', task);
        const emptyCard = document.createElement('div');
        emptyCard.style.display = 'none';
        return emptyCard;
    }
    
    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';
    
    // Определяем класс по статусу
    let statusClass = '';
    if (task.status === 'От') {
        statusClass = 'postponed'; // Откладыши: "От" (красный)
    } else if (task.status === 'П') {
        statusClass = 'with-hint'; // С подсказкой: "П" (фиолетовый)
    } else if (task.status === 'Н') {
        statusClass = 'current-series'; // Текущая серия: "Н" (оранжевый)
    } else if (task.status === 'Р') {
        statusClass = 'solved'; // Разобрано: "Р" (зелёный)
    }
    
    if (statusClass) {
        taskCard.classList.add(statusClass);
    }
    
    // Безопасное получение numberText
    const numberText = task.numberText || String(task.number);
    
    // Отображаем номер с пометкой если есть
    const displayNumber = numberText !== String(task.number)
        ? `${task.number} <span class="task-note">${numberText.replace(/^\d+\s*/, '')}</span>`
        : task.number;
    
    // Безопасное получение description
    const description = task.description || 'Условие не указано';
    
    taskCard.innerHTML = `
        <div class="task-header">
            <div class="task-number">Задача ${displayNumber}</div>
            <div class="task-status-badge">${getStatusText(task.status)}</div>
        </div>
        <button class="task-toggle">
            <span class="toggle-icon">▼</span>
            Показать условие
        </button>
        <div class="task-description">
            ${escapeHtml(description)}
        </div>
    `;
    
    // Обработчик раскрытия/скрытия
    const toggleBtn = taskCard.querySelector('.task-toggle');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isOpen = taskCard.classList.toggle('open');
            toggleBtn.innerHTML = isOpen
                ? '<span class="toggle-icon">▲</span> Скрыть условие'
                : '<span class="toggle-icon">▼</span> Показать условие';
        });
    }
    
    return taskCard;
}

function getStatusText(status) {
    const statusMap = {
        'Р': 'Разобрано',
        'П': 'Подсказка',
        'Н': 'Новая',
        'От': 'Откладыш'
    };
    return statusMap[status] || status;
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// СТАТИСТИКА
// ============================================

function updateStatistics(tasks) {
    const total = tasks.length;
    const solved = tasks.filter(t => t.status === 'Р').length;
    const current = tasks.filter(t => t.status === 'Н').length; // Текущая серия: "Н"
    const postponed = tasks.filter(t => t.status === 'От' || t.status === 'П').length; // Откладыши: "От" + "П"
    const unsolved = current + postponed;
    
    document.getElementById('totalTasks').textContent = total;
    document.getElementById('solvedTasks').textContent = current + unsolved;
    document.getElementById('currentSeries').textContent = current;
    document.getElementById('postponedTasks').textContent = unsolved;
    
    // Обновляем заголовки секций
    updateSectionTitle('current-series', `Текущая серия (${current})`);
    updateSectionTitle('postponed', `Откладыши (${postponed})`);
    updateSectionTitle('unsolved', `Неразобранные задачи (${unsolved})`);
}

function updateSectionTitle(sectionId, title) {
    const section = document.getElementById(sectionId);
    if (section) {
        const titleElement = section.querySelector('.part-title');
        if (titleElement) {
            titleElement.textContent = title;
        }
    }
}

// ============================================
// НАВИГАЦИЯ
// ============================================

function initMatCenterNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const targetId = link.getAttribute('href').substring(1);
            
            // Скрываем все секции
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });
            
            // Показываем нужную секцию
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = 'block';
                
                // Фильтруем и отображаем задачи
                filterAndDisplayTasks(targetId);
            }
            
            // Прокрутка к секции
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    });
}

function filterAndDisplayTasks(filterId) {
    let filteredTasks = [];
    let containerId = '';
    
    switch (filterId) {
        case 'all-tasks':
            filteredTasks = allTasks;
            containerId = 'tasksContainer';
            break;
        case 'current-series':
            filteredTasks = allTasks.filter(t => t.status === 'Н'); // Текущая серия: "Н"
            containerId = 'currentSeriesContainer';
            break;
        case 'postponed':
            filteredTasks = allTasks.filter(t => t.status === 'От' || t.status === 'П'); // Откладыши: "От" + "П"
            containerId = 'postponedContainer';
            break;
        case 'unsolved':
            filteredTasks = allTasks.filter(t => t.status === 'Н' || t.status === 'От' || t.status === 'П'); // Все неразобранные
            containerId = 'unsolvedContainer';
            break;
    }
    
    displayTasks(filteredTasks, containerId);
}

// ============================================
// ПОИСК
// ============================================

function initMatCenterSearch() {
    const searchInput = document.getElementById('searchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            
            if (searchTerm === '') {
                displayTasks(allTasks);
                return;
            }
            
            const filteredTasks = allTasks.filter(task => {
                const numberMatch = task.number.toString().includes(searchTerm);
                const descriptionMatch = task.description.toLowerCase().includes(searchTerm);
                return numberMatch || descriptionMatch;
            });
            
            displayTasks(filteredTasks);
        });
    }
}

// ============================================
// ТЕСТОВЫЕ ДАННЫЕ (для демонстрации)
// ============================================


console.log('✅ МатЦентр загружен успешно!');

