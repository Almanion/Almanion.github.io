// ============================================
// МАТЦЕНТР - РАБОТА С GOOGLE SHEETS
// ============================================

const SPREADSHEET_ID = '1K7Phvgrzu_RyzoCGiVMZOq3PQK2VxXQA6OJV6kgs1Ug';

// URL вашего Google Apps Script Web App (если настроен)
// Оставьте пустым, чтобы использовать прямой CSV экспорт
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxR1AIjejjyLXzb03Q6FkgfI9MwtQ_-8MhG-NzmM4GIwWalZHF971vWPRMR8y__7nA/exec';

let allTasks = [];
let currentFilter = 'all';

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadTasksFromGoogleSheets();
    initMatCenterNavigation();
    initMatCenterSearch();
    
    // Кнопка обновления в заголовке
    const refreshButton = document.getElementById('refreshButton');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            refreshButton.disabled = true;
            refreshButton.textContent = '⏳ Обновление...';
            
            loadTasksFromGoogleSheets().finally(() => {
                refreshButton.disabled = false;
                refreshButton.textContent = '🔄 Обновить данные';
            });
        });
    }
    
    // Автообновление каждые 5 минут
    setInterval(loadTasksFromGoogleSheets, 5 * 60 * 1000);
});

// ============================================
// ЗАГРУЗКА ДАННЫХ ИЗ GOOGLE SHEETS
// ============================================

async function loadTasksFromGoogleSheets() {
    const loadingMessage = document.getElementById('loadingMessage');
    const tasksContainer = document.getElementById('tasksContainer');
    
    // Показываем сообщение о загрузке и очищаем предыдущие ошибки
    if (loadingMessage) {
        loadingMessage.style.display = 'block';
        loadingMessage.innerHTML = `
            <div class="spinner"></div>
            <p>Загрузка задач из Google Таблицы...</p>
        `;
    }
    
    console.log('=================================');
    console.log('🚀 Начало загрузки данных');
    console.log('Apps Script URL:', APPS_SCRIPT_URL ? 'настроен ✅' : 'не настроен ❌');
    console.log('=================================');
    
    try {
        let tasks = [];
        
        // Пробуем загрузить через Apps Script (если настроен)
        if (APPS_SCRIPT_URL) {
            console.log('📍 Метод загрузки: Apps Script');
            console.log('URL:', APPS_SCRIPT_URL);
            tasks = await loadFromAppsScript();
        } else {
            // Используем публичный доступ к таблице (экспорт в CSV)
            console.log('📍 Метод загрузки: CSV Export');
            tasks = await loadFromCSVExport();
        }
        
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
        
        // Определяем тип ошибки
        const isCorsError = error.message.includes('Failed to fetch') || 
                           error.message.includes('CORS') ||
                           error.message.includes('NetworkError');
                // Другая ошибка
                loadingMessage.innerHTML = `
                    <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                        <button id="retryButtonInline" class="retry-button">
                            🔄 Обновить данные
                        </button>
                    </div>
                `;
                
                // Обработчик для встроенной кнопки retry
                setTimeout(() => {
                    const retryButtonInline = document.getElementById('retryButtonInline');
                    if (retryButtonInline) {
                        retryButtonInline.addEventListener('click', () => {
                            loadingMessage.innerHTML = `
                                <div class="spinner"></div>
                                <p>Повторная загрузка данных...</p>
                            `;
                            setTimeout(() => loadTasksFromGoogleSheets(), 100);
                        });
                    }
                }, 100);
    }
}

// ============================================
// ЗАГРУЗКА ЧЕРЕЗ APPS SCRIPT
// ============================================

async function loadFromAppsScript() {
    console.log('🔵 Загрузка через Apps Script:', APPS_SCRIPT_URL);
    
    const response = await fetch(APPS_SCRIPT_URL);
    
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
        throw new Error('Не удалось распарсить ответ от Apps Script');
    }
    
    console.log('📊 Данные распарсены:', data);
    
    if (!data.success) {
        console.error('❌ Apps Script вернул ошибку:', data.error);
        throw new Error(data.error || 'Ошибка загрузки из Apps Script');
    }
    
    console.log('✅ Apps Script вернул задач:', data.count);
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

// ============================================
// ЗАГРУЗКА ЧЕРЕЗ CSV EXPORT
// ============================================

async function loadFromCSVExport() {
    const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=0`;
    
    console.log('Загрузка CSV из:', url);
    
    const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const csvText = await response.text();
    console.log('CSV загружен, длина:', csvText.length);
    
    if (!csvText || csvText.length < 50) {
        throw new Error('Пустой или слишком короткий ответ');
    }
    
    const tasks = parseCSV(csvText);
    
    if (tasks.length === 0) {
        throw new Error('Не удалось распарсить задачи из CSV');
    }
    
    return tasks;
}

// ============================================
// ПАРСИНГ CSV
// ============================================

function parseCSV(csvText) {
    const lines = csvText.split('\n');
    const tasks = [];
    
    console.log('Всего строк в CSV:', lines.length);
    console.log('Первая строка (заголовок):', lines[0]);
    
    // Пропускаем заголовок (первая строка)
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        // Парсим CSV с учетом кавычек
        const columns = parseCSVLine(line);
        
        // Отладка для первых нескольких строк
        if (i <= 5) {
            console.log(`Строка ${i}:`, columns);
        }
        
        // Структура: A - Номер, B - Статус, C - Текст задачи
        if (columns.length >= 3) {
            const number = columns[0].trim();
            const status = columns[1].trim();
            const description = columns[2].trim();
            
            // Пропускаем строки без номера или статуса
            if (!number || !status) {
                if (i <= 10) console.log(`Пропускаем строку ${i}: пустой номер или статус`);
                continue;
            }
            
            // Пропускаем заголовки вроде "Номер", "Статус"
            if (number.toLowerCase() === 'номер' || status.toLowerCase() === 'статус') {
                console.log(`Пропускаем заголовок в строке ${i}`);
                continue;
            }
            
            // Извлекаем чистый номер (может быть "98 (ЛЗ 36)" или просто "98")
            const cleanNumber = extractNumber(number);
            if (!cleanNumber) {
                if (i <= 10) console.log(`Не удалось извлечь номер из "${number}" в строке ${i}`);
                continue;
            }
            
            tasks.push({
                number: cleanNumber,
                numberText: number, // Оригинальный текст с пометками
                status: status,
                description: description || 'Условие не указано'
            });
        }
    }
    
    console.log('Итого задач распарсено:', tasks.length);
    if (tasks.length > 0) {
        console.log('Первая задача:', tasks[0]);
        console.log('Последняя задача:', tasks[tasks.length - 1]);
    }
    
    return tasks;
}

// Извлечение номера из текста типа "98 (ЛЗ 36)"
function extractNumber(text) {
    const match = text.match(/^(\d+)/);
    return match ? parseInt(match[1]) : null;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    return result;
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
    document.getElementById('solvedTasks').textContent = solved;
    document.getElementById('currentSeries').textContent = current;
    document.getElementById('postponedTasks').textContent = postponed;
    
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

