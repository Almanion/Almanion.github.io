function buildTasksPayloadSignature(tasks) {
    if (!Array.isArray(tasks)) return '';
    // Every rendering-relevant field participates in the signature. The former
    // sampling logic missed changed conditions and same-length hints.
    return JSON.stringify(tasks.map(task => [
        task && (task.taskId || task.id || ''),
        task && task.grade,
        task && task.number,
        task && task.numberText,
        task && task.status,
        task && task.description,
        task && task.hint,
        task && task._endpointIdx
    ]));
}

function showMatcenterDataWarning(message) {
    let warning = document.getElementById('matcenterDataWarning');
    if (!message) {
        if (warning) warning.remove();
        return;
    }
    if (!warning) {
        warning = document.createElement('div');
        warning.id = 'matcenterDataWarning';
        warning.className = 'matcenter-data-warning';
        warning.setAttribute('role', 'status');
        warning.setAttribute('aria-live', 'polite');
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage && loadingMessage.parentNode) {
            loadingMessage.parentNode.insertBefore(warning, loadingMessage);
        }
    }
    warning.textContent = message;
}

function readTasksCache() {
    try {
        const raw = safeGet(TASKS_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && Array.isArray(parsed.tasks) ? parsed : null;
    } catch (_) {
        return null;
    }
}

function getTaskEndpointIndex(task) {
    const explicitIndex = Number(task && task._endpointIdx);
    if (Number.isInteger(explicitIndex) && explicitIndex >= 0) return explicitIndex;
    // Миграция старого кеша, созданного до появления _endpointIdx.
    return task && task.grade === 'grade-summer-9-10' ? 1 : 0;
}

function getCachedTasksByEndpoint() {
    const cache = readTasksCache();
    const grouped = new Map();
    if (!cache) return grouped;
    cache.tasks.forEach(task => {
        const endpointIdx = getTaskEndpointIndex(task);
        if (!grouped.has(endpointIdx)) grouped.set(endpointIdx, []);
        grouped.get(endpointIdx).push(Object.assign({}, task, { _endpointIdx: endpointIdx }));
    });
    return grouped;
}

function getEndpointLabel(endpointIdx) {
    if (endpointIdx === 0) return 'основная таблица (9 класс)';
    if (endpointIdx === 1) return 'летняя серия 9–10';
    return `источник №${endpointIdx + 1}`;
}

function applyTasksFromCache() {
    try {
        const parsed = readTasksCache();
        if (!parsed || parsed.tasks.length === 0) return false;

        allTasks = normalizeAllTasks(parsed.tasks);
        lastTasksPayloadSignature = buildTasksPayloadSignature(parsed.tasks);
        updateStatistics(getTasksForCurrentGrade());
        refreshCurrentView();

        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) loadingMessage.style.display = 'none';
        return true;
    } catch (_) {
        return false;
    }
}

async function loadTasksFromGoogleSheets(fromAuthAttempt = false, silent = false) {
    const loadingMessage = document.getElementById('loadingMessage');
    const retryBtn = document.getElementById('retryButton');

    const showRetryUI = (msg) => {
        if (!loadingMessage) return;
        // Делаем сообщение пользовательски-понятным — техническую ошибку прячем в title
        const technicalMsg = String(msg || '');
        const isNetwork = /Сеть|network|fetch|HTTP/i.test(technicalMsg);
        const isAuth = /403|401|unauthor|пароль/i.test(technicalMsg);
        const friendly = isAuth
            ? 'Не удалось авторизоваться. Проверьте пароль или попробуйте ещё раз.'
            : isNetwork
                ? 'Не удалось связаться с сервером. Проверьте подключение к интернету.'
                : 'Не удалось загрузить задачи. Возможно, сервер временно недоступен.';
        loadingMessage.style.display = 'block';
        loadingMessage.innerHTML = `
            <div class="loading-error-wrap" style="text-align:center;padding:1rem 0;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:48px;height:48px;color:var(--error-color, #ef4444);opacity:0.7;margin:0 auto 0.75rem;display:block;">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p class="loading-error" style="margin:0 0 1rem 0;" title="${escapeHtml(technicalMsg)}">${escapeHtml(friendly)}</p>
                <button id="retryButton" class="retry-button" style="display:inline-flex;align-items:center;gap:0.5rem;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:16px;height:16px;">
                        <path d="M21 12a9 9 0 0 1-15.45 6.36L3 16"/>
                        <path d="M3 12a9 9 0 0 1 15.45-6.36L21 8"/>
                        <polyline points="21 3 21 8 16 8"/>
                        <polyline points="3 21 3 16 8 16"/>
                    </svg>
                    Попробовать снова
                </button>
            </div>
        `;
        document.getElementById('retryButton')?.addEventListener('click', () => loadTasksFromGoogleSheets(false));
    };

    // В silent-режиме (refresh-кнопка, автообновление) не показываем большую плашку
    if (!silent && loadingMessage) {
        loadingMessage.style.display = 'block';
        loadingMessage.innerHTML = `<div class="spinner"></div><p>Загрузка задач...</p>`;
        if (retryBtn) retryBtn.style.display = 'none';
    }
    
    console.log('=================================');
    console.log('🚀 Начало загрузки данных');
    console.log('Endpoint:', API_ENDPOINT ? 'настроен ✅' : 'не настроен ❌');
    console.log('=================================');
    
    try {
        let tasks = [];
        let adminFlag = false;
        
        // Загружаем данные с проверкой пароля
        console.log('📍 Метод загрузки: Авторизованный доступ');
        console.log('Endpoint:', API_ENDPOINT.substring(0, 30) + '...');
        const result = await loadFromAppsScript();
        tasks = result.tasks;
        adminFlag = result.isAdmin;

        if (result.failures.length > 0) {
            const failedSources = result.failures.map(item => getEndpointLabel(item.endpointIdx));
            const restoredCount = result.failures.filter(item => item.usedCache).length;
            const restoredAll = restoredCount === result.failures.length;
            showMatcenterDataWarning(
                `Временно не обновились: ${failedSources.join(', ')}. ` +
                (restoredAll
                    ? 'Показана последняя сохранённая копия; уже загруженные задачи не потеряны.'
                    : 'Сохранённой копии нет, поэтому часть задач пока отсутствует.')
            );
        } else {
            showMatcenterDataWarning('');
        }
        
        console.log('=================================');
        console.log('📊 РЕЗУЛЬТАТ ЗАГРУЗКИ:');
        console.log('Задач загружено:', tasks.length);
        console.log('Статусы:', {
            'Р (разобрано)': tasks.filter(t => t.status === 'Р').length,
            'Н (текущая серия)': tasks.filter(t => t.status === 'Н').length,
            'П (отложены с подсказкой)': tasks.filter(t => t.status === 'П').length,
            'От (отложены)': tasks.filter(t => t.status === 'От').length
        });
        console.log('=================================');
        
        const newSignature = buildTasksPayloadSignature(tasks);
        if (silent && newSignature && newSignature === lastTasksPayloadSignature) {
            console.log('📦 Данные не изменились — перерисовка не нужна');
            return;
        }
        lastTasksPayloadSignature = newSignature;
        
        allTasks = normalizeAllTasks(tasks);
        isAdmin = adminFlag;
        
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
        
        updateStatistics(getTasksForCurrentGrade());
        refreshCurrentView();
        
        // Сохраняем в кэш для офлайн-режима
        try {
            safeSet(TASKS_CACHE_KEY, JSON.stringify({
                version: TASKS_CACHE_VERSION,
                tasks,
                timestamp: Date.now()
            }));
        } catch (e) { /* ignore */ }
        
        // Скрываем сообщение о загрузке и очищаем его содержимое
        if (!silent && loadingMessage) {
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

        if (fromAuthAttempt) {
            if (loadingMessage) loadingMessage.style.display = 'none';
            throw error;
        }

        // В silent-режиме не показываем плашку с ошибкой — пробрасываем наверх,
        // вызывающий покажет alert; данные на странице остаются прежними
        if (silent) {
            throw error;
        }

        // Пробуем загрузить из кэша
        try {
            const raw = safeGet(TASKS_CACHE_KEY);
            if (raw) {
                const { tasks } = JSON.parse(raw);
                if (Array.isArray(tasks) && tasks.length > 0) {
                    allTasks = normalizeAllTasks(tasks);
                    updateStatistics(getTasksForCurrentGrade());
                    refreshCurrentView();
                }
            }
        } catch (e) { /* ignore */ }

        showRetryUI(error.message || 'Ошибка загрузки');
    }
}

// ============================================
// DATA LOADING
// ============================================

async function loadFromOneEndpoint(endpoint, endpointIdx) {
    const clientId = deviceFingerprint ? deviceFingerprint.substring(0, 16) : 'unknown';
    let data;
    if (matcenterAuthMode === 'account') {
        try {
            data = await postMatcenterJson(endpoint, {
                idToken: await getMatcenterIdToken(),
                clientId
            });
        } catch (error) {
            if (!error.code) error.code = 'NETWORK';
            throw error;
        }
    } else {
        const url = `${endpoint}?password=${encodeURIComponent(authToken)}&clientId=${encodeURIComponent(clientId)}`;
        let response;
        try {
            response = await fetch(url);
        } catch (error) {
            const wrapped = new Error('Сеть: ' + (error && error.message || error));
            wrapped.code = 'NETWORK';
            throw wrapped;
        }
        if (!response.ok) {
            const httpError = new Error(`HTTP ${response.status}`);
            httpError.code = response.status === 401 || response.status === 403 ? 'AUTH' : 'HTTP';
            throw httpError;
        }
        const text = await response.text();
        try { data = JSON.parse(text); }
        catch (_) { throw new Error('Невалидный JSON: ' + text.substring(0, 100)); }
    }

    if (!data.success) {
        const apiError = new Error(data.error || 'Ошибка сервера');
        if (/парол|недостаточно прав|unauthor/i.test(apiError.message)) apiError.code = 'AUTH';
        throw apiError;
    }

    if (!Array.isArray(data.tasks)) {
        throw new Error('tasks не массив');
    }

    const tasks = data.tasks.map((task, index) => {
        if (!task || typeof task !== 'object') return null;
        if (task.number === undefined || task.number === null || task.number === '') return null;

        const cleanNumber = extractNumber(task.number);
        if (cleanNumber === null || isNaN(cleanNumber)) return null;

        const gradeRaw = task.grade ? String(task.grade).trim() : '';
        const grade = gradeRaw && GRADE_SECTIONS.some(g => g.id === gradeRaw)
            ? gradeRaw
            : DEFAULT_GRADE;

        const statusRaw = task.status == null ? '' : String(task.status).trim();

        return {
            taskId: String(task.taskId || task.id || '').trim(),
            number: cleanNumber,
            numberText: String(task.number),
            status: statusRaw,
            description: task.description ? String(task.description) : 'Условие не указано',
            hint: task.hint ? String(task.hint) : '',
            grade,
            _endpointIdx: endpointIdx
        };
    }).filter(t => t !== null);

    return {
        tasks: tasks,
        isAdmin: !!data.isAdmin
    };
}

async function loadFromAppsScript() {
    console.log('🔵 Загрузка с', TASKS_ENDPOINTS.length, 'таблиц(ы)...');

    if (TASKS_ENDPOINTS.length === 0) {
        throw new Error('Не настроены endpoints в matcenter/00-core.js');
    }

    const results = await Promise.allSettled(
        TASKS_ENDPOINTS.map((url, idx) => loadFromOneEndpoint(url, idx))
    );

    const allTasks = [];
    const cachedByEndpoint = getCachedTasksByEndpoint();
    let isAdmin = false;
    let successCount = 0;
    let lastError = null;
    const failures = [];

    results.forEach((r, idx) => {
        if (r.status === 'fulfilled') {
            successCount++;
            const freshTasks = r.value.tasks;
            const cachedTasks = cachedByEndpoint.get(idx) || [];
            if (freshTasks.length === 0 && cachedTasks.length > 0) {
                allTasks.push(...cachedTasks);
                failures.push({
                    endpointIdx: idx,
                    message: 'Источник неожиданно вернул пустой список',
                    usedCache: true
                });
                console.warn(`⚠️ Endpoint #${idx} вернул пустой список; сохранено ${cachedTasks.length} задач из кеша`);
            } else {
                allTasks.push(...freshTasks);
            }
            if (r.value.isAdmin) isAdmin = true;
            console.log(`✅ Endpoint #${idx}: ${freshTasks.length} задач${r.value.isAdmin ? ' (АДМИН)' : ''}`);
        } else {
            lastError = r.reason;
            const cachedTasks = cachedByEndpoint.get(idx) || [];
            if (cachedTasks.length > 0) allTasks.push(...cachedTasks);
            failures.push({
                endpointIdx: idx,
                message: r.reason && r.reason.message ? r.reason.message : String(r.reason || 'Ошибка'),
                usedCache: cachedTasks.length > 0
            });
            console.warn(
                `⚠️ Endpoint #${idx} не отвечает${cachedTasks.length ? `; восстановлено из кеша: ${cachedTasks.length}` : ''}:`,
                r.reason && r.reason.message || r.reason
            );
        }
    });

    // Если ни одна таблица не ответила — это полный отказ.
    if (successCount === 0) {
        throw lastError instanceof Error
            ? lastError
            : new Error('Не удалось загрузить ни одну из таблиц');
    }

    console.log('🎉 Всего задач со всех таблиц:', allTasks.length);

    return {
        tasks: allTasks,
        isAdmin: isAdmin,
        successCount,
        failures
    };
}

function resolveTaskReference(taskOrNumber) {
    if (taskOrNumber && typeof taskOrNumber === 'object') return taskOrNumber;
    const raw = String(taskOrNumber == null ? '' : taskOrNumber);
    const numeric = extractNumber(raw);
    return allTasks.find(task =>
        task.grade === currentGrade
        && (String(task.numberText) === raw || task.number === numeric)
    ) || null;
}

function getTaskMutationParams(taskOrNumber) {
    const task = resolveTaskReference(taskOrNumber);
    return {
        task,
        taskId: task && task.taskId ? task.taskId : '',
        taskNumber: task ? (task.numberText || String(task.number)) : String(taskOrNumber || ''),
        grade: task ? (task.grade || currentGrade || DEFAULT_GRADE) : (currentGrade || DEFAULT_GRADE)
    };
}

// Извлечение номера из текста типа "98 (ЛЗ 36)" или "8.5 Алгебра".
// Поддерживает дробные числа — нужно для псевдо-задач разделов (0.5, 8.5, …).
function extractNumber(text) {
    const str = String(text == null ? '' : text).trim();
    const match = str.match(/^(\d+(?:[.,]\d+)?)/);
    if (!match) return null;
    return parseFloat(match[1].replace(',', '.'));
}

