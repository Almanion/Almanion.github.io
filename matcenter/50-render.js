// ============================================
// ОТОБРАЖЕНИЕ ЗАДАЧ
// ============================================

// Перед перерисовкой списка сохраняем, какие карточки были раскрыты —
// иначе автообновление, refresh и поиск закрывают все открытые условия разом.
function captureTaskCardUiState(container) {
    const open = new Set();
    const hintOpen = new Set();
    if (!container) return { open, hintOpen };

    container.querySelectorAll('.task-card[data-solved-key]').forEach(card => {
        const key = card.dataset.solvedKey;
        if (!key) return;
        if (card.classList.contains('open')) open.add(key);
        if (card.classList.contains('hint-open')) hintOpen.add(key);
    });
    return { open, hintOpen };
}

function restoreTaskCardUiState(container, uiState) {
    if (!container || !uiState) return;

    container.querySelectorAll('.task-card[data-solved-key]').forEach(card => {
        const key = card.dataset.solvedKey;
        if (!key) return;

        if (uiState.open.has(key)) {
            card.classList.add('open');
            const toggleBtn = card.querySelector('.task-condition-toggle');
            if (toggleBtn) {
                toggleBtn.innerHTML = '<span class="toggle-icon">▲</span> Скрыть условие';
                toggleBtn.setAttribute('aria-expanded', 'true');
            }
            const descEl = card.querySelector('.task-description');
            if (descEl && typeof renderLatexInElement === 'function') {
                renderLatexInElement(descEl);
                descEl.dataset.latexRendered = 'true';
            }
        }

        if (uiState.hintOpen.has(key)) {
            card.classList.add('hint-open');
            const hintToggleBtn = card.querySelector('.hint-toggle');
            if (hintToggleBtn) {
                hintToggleBtn.innerHTML = '<span class="toggle-icon"><span class="eic eic-bulb" aria-hidden="true"></span></span> Скрыть подсказку';
                hintToggleBtn.classList.add('active');
                hintToggleBtn.setAttribute('aria-expanded', 'true');
            }
            const hintElement = card.querySelector('.task-hint');
            if (hintElement && typeof renderLatexInElement === 'function') {
                renderLatexInElement(hintElement);
                hintElement.dataset.latexRendered = 'true';
            }
        }
    });
}

function displayTasks(tasks, containerId = 'tasksContainer') {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`⚠️ Контейнер ${containerId} не найден!`);
        return;
    }
    
    if (!tasks || !Array.isArray(tasks)) {
        console.warn(`⚠️ Некорректный массив задач`);
        return;
    }
    
    if (tasks.length === 0) {
        if (getTasksForCurrentGrade().length === 0) {
            showEmptyGradeMessage(container);
        } else {
            // Фильтр/поиск ничего не нашёл — но в классе задачи есть.
            // Показываем дружелюбное empty state с подсказкой "сбросить фильтры".
            const searchInput = document.getElementById('searchInput');
            const hasSearch = searchInput && searchInput.value && searchInput.value.trim().length > 0;
            container.innerHTML = `
                <div class="empty-grade-message">
                    <svg class="empty-grade-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:48px;height:48px;opacity:0.5;">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="m21 21-4.3-4.3"/>
                    </svg>
                    <p>${hasSearch ? 'По вашему запросу ничего не найдено' : 'В этой категории пока нет задач'}</p>
                    <button type="button" class="empty-grade-reset" id="emptyGradeReset" style="margin-top:1rem;padding:0.5rem 1rem;background:var(--accent-color);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;">Сбросить фильтры</button>
                </div>
            `;
            const resetBtn = document.getElementById('emptyGradeReset');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    if (searchInput) searchInput.value = '';
                    if (typeof setActiveFilter === 'function') setActiveFilter('all');
                    if (typeof refreshCurrentView === 'function') refreshCurrentView();
                });
            }
        }
        return;
    }
    
    // Летние серии выдаются целиком, удобнее по возрастанию (1, 2, 3, …).
    // Обычные классы — по убыванию (свежие задачи сверху).
    const ascending = typeof currentGrade === 'string' && currentGrade.indexOf('summer') !== -1;
    const sortedTasks = [...tasks].sort((a, b) => ascending ? a.number - b.number : b.number - a.number);

    const uiState = captureTaskCardUiState(container);
    container.innerHTML = '';

    // Собираем все карточки в DocumentFragment — один reflow вместо N
    const fragment = document.createDocumentFragment();
    let addedCount = 0;
    sortedTasks.forEach((task, index) => {
        try {
            const taskElement = createTaskElement(task);
            fragment.appendChild(taskElement);
            addedCount++;
        } catch (error) {
            console.error(`❌ Ошибка при создании элемента для задачи #${task.number} (индекс ${index}):`, error);
        }
    });
    container.appendChild(fragment);
    applyPersonalSolvedMarks();
    restoreTaskCardUiState(container, uiState);
}

function createTaskElement(task) {
    // Валидация данных задачи
    if (!task || task.number === undefined || task.number === null || isNaN(task.number)) {
        console.warn('⚠️ Пропускаем задачу без номера:', task);
        const emptyCard = document.createElement('div');
        emptyCard.style.display = 'none';
        return emptyCard;
    }

    // Псевдо-задача (раздел или вводный текст) — дробный номер вида 0.5, 8.5 и т.д.
    if (!Number.isInteger(task.number)) {
        const banner = document.createElement('div');
        banner.className = 'task-section-banner';
        const inner = document.createElement('div');
        inner.className = 'task-section-banner-inner';
        inner.textContent = task.description || '';
        banner.appendChild(inner);
        // KaTeX-рендер формул, если есть
        if (typeof renderLatexInElement === 'function') {
            setTimeout(() => renderLatexInElement(banner), 0);
        }
        return banner;
    }

    const taskCard = document.createElement('div');
    taskCard.className = 'task-card';
    const solvedKey = getSolvedTaskKey(task);
    const personallySolved = isTaskPersonallySolved(solvedKey);
    taskCard.dataset.solvedKey = solvedKey;
    if (personallySolved) taskCard.classList.add('user-solved');

    // В летних сериях статусов нет вообще — не подкрашиваем карточки и не показываем бейдж.
    const isSummerTask = isSummerGrade(task.grade);

    // Определяем класс по статусу (только для не-летних)
    let statusClass = '';
    if (!isSummerTask) {
        if (task.status === 'От') {
            statusClass = 'postponed'; // Отложены: "От" (красный)
        } else if (task.status === 'П') {
            statusClass = 'with-hint'; // С подсказкой: "П" (фиолетовый)
        } else if (task.status === 'Н') {
            statusClass = 'current-series'; // Текущая серия: "Н" (оранжевый)
        } else if (task.status === 'Р') {
            statusClass = 'solved'; // Разобрано: "Р" (зелёный)
        }
    }

    if (statusClass) {
        taskCard.classList.add(statusClass);
    }
    
    // Безопасное получение numberText
    const numberText = task.numberText || String(task.number);
    const taskDomKey = escapeHtml(String(task.taskId || `${task.grade}-${task.number}`).replace(/[^a-zA-Z0-9_-]/g, '-'));
    
    // Отображаем номер с пометкой если есть (с защитой от XSS!)
    const safeNumberText = escapeHtml(numberText.replace(/^\d+\s*/, ''));
    const displayNumber = numberText !== String(task.number)
        ? `${escapeHtml(String(task.number))} <span class="task-note">${safeNumberText}</span>`
        : escapeHtml(String(task.number));
    const solvedTitle = personallySolved
        ? 'Убрать отметку «решено»'
        : (personalSolvedUser ? 'Отметить задачу как решённую' : 'Войдите в аккаунт, чтобы сохранять решённые задачи');
    
    // Безопасное получение description
    const description = task.description || 'Условие не указано';
    
    // Проверяем наличие подсказки.
    // В летних сериях подсказок нет в принципе — не показываем ни кнопку,
    // ни (для админа) кнопку добавления подсказки.
    const hint = task.hint || null;
    const hasHint = hint !== null && !isSummerTask;

    // Формируем HTML подсказки
    let hintHTML = '';
    if (hasHint) {
        // Обрезаем начальные и конечные пробелы/переносы, но сохраняем внутренние переносы
        const trimmedHint = hint.trim();
        hintHTML = `
            <button class="task-toggle hint-toggle" aria-expanded="false" aria-controls="hint-${taskDomKey}">
                <span class="toggle-icon"><span class="eic eic-bulb" aria-hidden="true"></span></span>
                Показать подсказку
            </button>
            <div class="task-hint" id="hint-${taskDomKey}" data-hint-id="hint-${taskDomKey}">${escapeHtml(trimmedHint)}</div>
        `;
    }
    
    // Формируем HTML кнопки для админа (в летних сериях подсказок нет — кнопку не показываем)
    let adminButtonHTML = '';
    if (isAdmin && !isSummerTask) {
        adminButtonHTML = `
            <button class="admin-hint-button" title="${hint !== null ? 'Изменить подсказку' : 'Добавить подсказку'}">
                <span class="eic eic-bulb" aria-hidden="true"></span> Подсказка
            </button>
        `;
    }
    
    // Бейдж статуса: в летних сериях статусы не используются — вообще ничего не показываем.
    // В обычных классах: показываем статус, а для админа дополнительно даём поставить.
    let statusBadgeHTML = '';
    if (!isSummerTask) {
        if (task.status) {
            statusBadgeHTML = isAdmin
                ? `<button type="button" class="task-status-badge clickable" data-task-number="${escapeHtml(numberText)}" aria-haspopup="menu">${getStatusText(task.status)}</button>`
                : `<div class="task-status-badge">${getStatusText(task.status)}</div>`;
        } else if (isAdmin) {
            statusBadgeHTML = `<button type="button" class="task-status-badge clickable empty" data-task-number="${escapeHtml(numberText)}" aria-haspopup="menu">+ статус</button>`;
        }
    }
    
    taskCard.innerHTML = `
        <div class="task-header">
            <div class="task-number-wrap">
                <button type="button"
                    class="task-solved-check${personallySolved ? ' is-solved' : ''}"
                    aria-pressed="${personallySolved ? 'true' : 'false'}"
                    aria-label="${personallySolved ? 'Убрать отметку «решено»' : 'Отметить задачу как решённую'}"
                    title="${escapeHtml(solvedTitle)}">
                    <svg class="task-solved-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                    <span class="task-solved-burst" aria-hidden="true"></span>
                </button>
                <span class="task-number">
                    <span class="task-number-label">Задача ${displayNumber}</span>
                    <span class="task-solved-strike" aria-hidden="true"></span>
                </span>
                <span class="task-solved-caption" ${personallySolved ? '' : 'hidden'}>решено</span>
            </div>
            ${statusBadgeHTML}
        </div>
        <button class="task-toggle task-condition-toggle" aria-expanded="false" aria-controls="description-${taskDomKey}">
            <span class="toggle-icon">▼</span>
            Показать условие
        </button>
        <div class="task-description" id="description-${taskDomKey}">
            <div class="task-description-inner">${escapeHtml(description)}</div>
        </div>
        ${hintHTML}
        ${adminButtonHTML}
    `;
    
    // Обработчик раскрытия/скрытия условия
    const toggleBtn = taskCard.querySelector('.task-condition-toggle');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const isOpen = taskCard.classList.toggle('open');
            toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            toggleBtn.innerHTML = isOpen
                ? '<span class="toggle-icon">▲</span> Скрыть условие'
                : '<span class="toggle-icon">▼</span> Показать условие';

            // Рендерим LaTeX-формулы при первом раскрытии условия
            if (isOpen) {
                const descEl = taskCard.querySelector('.task-description');
                if (descEl && !descEl.dataset.latexRendered && typeof renderLatexInElement === 'function') {
                    renderLatexInElement(descEl);
                    descEl.dataset.latexRendered = 'true';
                }
            }
        });
    }
    
    // Обработчик раскрытия/скрытия подсказки
    const hintToggleBtn = taskCard.querySelector('.hint-toggle');
    if (hintToggleBtn) {
        hintToggleBtn.addEventListener('click', () => {
            const isOpen = taskCard.classList.toggle('hint-open');
            hintToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            hintToggleBtn.innerHTML = isOpen
                ? '<span class="toggle-icon"><span class="eic eic-bulb" aria-hidden="true"></span></span> Скрыть подсказку'
                : '<span class="toggle-icon"><span class="eic eic-bulb" aria-hidden="true"></span></span> Показать подсказку';
            if(isOpen){hintToggleBtn.classList.add('active');}else{hintToggleBtn.classList.remove('active');}
            
            // Рендерим LaTeX формулы при первом открытии
            if (isOpen) {
                const hintElement = taskCard.querySelector('.task-hint');
                if (hintElement && !hintElement.dataset.latexRendered) {
                    renderLatexInElement(hintElement);
                    hintElement.dataset.latexRendered = 'true';
                }
            }
        });
    }
    
    // Обработчик кнопки админа для добавления/изменения подсказки
    const adminButton = taskCard.querySelector('.admin-hint-button');
    if (adminButton) {
        adminButton.addEventListener('click', (e) => {
            e.stopPropagation();
            showHintModal(task, hint || '');
        });
    }

    const solvedToggle = taskCard.querySelector('.task-solved-check');
    if (solvedToggle) {
        solvedToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePersonalSolvedTask(task, taskCard);
        });
    }
    
    // Обработчик клика на статус для админов
    if (isAdmin) {
        const statusBadge = taskCard.querySelector('.task-status-badge.clickable');
        if (statusBadge) {
            statusBadge.addEventListener('click', (e) => {
                e.stopPropagation();
                showStatusDropdown(statusBadge, task);
            });
        }
    }
    
    return taskCard;
}

function getStatusText(status) {
    const statusMap = {
        'Р': 'Разобрано',
        'П': 'Подсказка',
        'Н': 'Серия',
        'От': 'Отложена'
    };
    return statusMap[status] || status;
}

// Показать выпадающий список выбора статуса
function showStatusDropdown(badgeElement, task) {
    // Удаляем существующий dropdown, если есть
    const existingDropdown = document.querySelector('.status-dropdown');
    if (existingDropdown) {
        existingDropdown.remove();
    }
    
    // Создаём dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'status-dropdown';
    
    const statuses = [
        { code: 'Н', text: 'Текущая серия' },
        { code: 'Р', text: 'Разобрано' },
        { code: 'П', text: 'Подсказка' },
        { code: 'От', text: 'Отложена' },
        { code: '', text: 'Без статуса' }
    ];
    
    statuses.forEach(status => {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'status-option';
        if (status.code === task.status) {
            option.classList.add('current');
        }
        option.textContent = status.text;
        option.dataset.statusCode = status.code;
        
        option.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            // Показываем загрузку
            option.innerHTML = '<span class="spinner-small"></span> Сохранение...';
            option.style.pointerEvents = 'none';
            
            try {
                await changeTaskStatus(task, status.code);
                
                // Успех - обновляем UI
                dropdown.remove();
                
                // task is the exact object rendered from allTasks; no ambiguous
                // number-only lookup across grades/endpoints is needed.
                task.status = status.code;
                
                updateStatistics(getTasksForCurrentGrade());
                refreshCurrentView();
                
            } catch (error) {
                option.innerHTML = status.text;
                option.style.pointerEvents = 'auto';
                alert('Ошибка изменения статуса: ' + error.message);
            }
        });
        
        dropdown.appendChild(option);
    });
    
    // Позиционируем dropdown под бейджем, не выходя за экран
    document.body.appendChild(dropdown);
    const rect = badgeElement.getBoundingClientRect();
    const ddRect = dropdown.getBoundingClientRect();
    const pad = 10;
    const ddWidth = ddRect.width || 160;
    if (rect.right + ddWidth > window.innerWidth - pad) {
        dropdown.style.left = 'auto';
        dropdown.style.right = `${window.innerWidth - rect.right}px`;
    } else {
        const left = Math.max(pad, rect.left);
        dropdown.style.left = `${left}px`;
        dropdown.style.right = 'auto';
    }
    dropdown.style.position = 'fixed';
    dropdown.style.top = `${rect.bottom + 5}px`;
    
    // Закрытие dropdown при клике вне его
    setTimeout(() => {
        const closeDropdown = (e) => {
            if (!dropdown.contains(e.target) && e.target !== badgeElement) {
                dropdown.remove();
                document.removeEventListener('click', closeDropdown);
            }
        };
        document.addEventListener('click', closeDropdown);
    }, 0);
}

// Найти endpoint, к которому принадлежит задача (для админских операций).
// Если задача не нашлась — используем первый endpoint как запасной.
function getEndpointForTask(taskOrNumber) {
    const task = resolveTaskReference(taskOrNumber);
    if (task && typeof task._endpointIdx === 'number' && TASKS_ENDPOINTS[task._endpointIdx]) {
        return TASKS_ENDPOINTS[task._endpointIdx];
    }
    return TASKS_ENDPOINTS[0];
}

// Изменить статус задачи на сервере
async function changeTaskStatus(taskOrNumber, newStatus) {
    const mutation = getTaskMutationParams(taskOrNumber);
    console.log(`🔄 Изменение статуса задачи №${mutation.taskNumber} на "${newStatus}"...`);

    const endpoint = getEndpointForTask(mutation.task || taskOrNumber);
    const params = new URLSearchParams({
        password: authToken || '',
        action: 'changeStatus',
        taskNumber: mutation.taskNumber,
        newStatus: newStatus || '',
        grade: mutation.grade,
        taskId: mutation.taskId
    });
    const url = `${endpoint}?${params.toString()}`;
    
    try {
        const response = await fetch(url);
        const responseText = await response.text();
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('❌ Ошибка парсинга ответа сервера:', parseError);
            throw new Error('Сервер вернул некорректный JSON: ' + responseText);
        }
        
        if (!data.success) {
            console.error('❌ Сервер вернул ошибку:', data.error);
            throw new Error(data.error || 'Ошибка при изменении статуса');
        }
        
        console.log('✅ Статус успешно изменён на сервере');
        return data;
        
    } catch (error) {
        console.error('❌ Не удалось изменить статус на сервере:', error);
        throw error;
    }
}

// Экранирование HTML для безопасности
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

