// ============================================
// СИСТЕМА ПОДСКАЗОК (АДМИН)
// ============================================

// Рендеринг LaTeX формул в элементе
function renderLatexInElement(element, attempts = 0) {
    const maxAttempts = 50; // Максимум 5 секунд ожидания (50 * 100ms)
    
    if (typeof renderMathInElement === 'undefined') {
        if (attempts < maxAttempts) {
            console.warn(`⚠️ KaTeX auto-render ещё не загружен, попытка ${attempts + 1}/${maxAttempts}...`);
            setTimeout(() => renderLatexInElement(element, attempts + 1), 100);
        } else {
            console.error('❌ KaTeX не загрузился за 5 секунд');
        }
        return;
    }
    
    try {
        renderMathInElement(element, {
            delimiters: [
                {left: '$$', right: '$$', display: true},
                {left: '\\[', right: '\\]', display: true},
                {left: '$', right: '$', display: false},
                {left: '\\(', right: '\\)', display: false}
            ],
            throwOnError: false,
            trust: false
        });
        console.log('✅ LaTeX отрендерен в подсказке');
    } catch (error) {
        console.error('❌ Ошибка рендеринга LaTeX:', error);
    }
}

// Подсказки теперь хранятся в Google Sheet и загружаются вместе с задачами

let activeHintTask = null;
let hintReturnFocus = null;

// Добавление/обновление подсказки
function setTaskHint(taskOrNumber, hintText) {
    if (!isAdmin) {
        console.error('❌ Только админы могут добавлять подсказки');
        return false;
    }
    
    const task = resolveTaskReference(taskOrNumber);
    if (task) {
        task.hint = hintText.trim();
        if (typeof invalidateMatcenterRenderCache === 'function') invalidateMatcenterRenderCache();
        console.log(`✅ Подсказка для задачи №${task.numberText || task.number} обновлена локально`);
    } else {
        console.warn('⚠️ Задача не найдена в allTasks');
        return false;
    }
    
    return true;
}

// Подсказка берётся напрямую из task.hint

// Сброс состояния кнопок модального окна
function resetHintModalButtons() {
    const saveBtn = document.getElementById('hintSaveBtn');
    const deleteBtn = document.getElementById('hintDeleteBtn');
    
    if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="eic eic-save" aria-hidden="true"></span> Сохранить';
        saveBtn.style.opacity = '1';
    }
    
    if (deleteBtn) {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<span class="eic eic-trash" aria-hidden="true"></span> Удалить подсказку';
        deleteBtn.style.opacity = '1';
    }
}

// Показать модальное окно добавления подсказки
function showHintModal(taskOrNumber, currentHint = '') {
    const modal = document.getElementById('hintModal');
    const overlay = document.getElementById('hintOverlay');
    const textarea = document.getElementById('hintTextarea');
    const taskNumberSpan = document.getElementById('hintTaskNumber');
    
    if (!modal || !overlay || !textarea || !taskNumberSpan) {
        console.error('❌ Элементы модального окна не найдены');
        return;
    }
    
    const task = resolveTaskReference(taskOrNumber);
    if (!task) {
        console.error('❌ Не удалось определить редактируемую задачу');
        return;
    }

    activeHintTask = task;
    hintReturnFocus = document.activeElement;

    // Сбрасываем состояние кнопок перед открытием
    resetHintModalButtons();
    
    taskNumberSpan.textContent = task.numberText || task.number;
    textarea.value = currentHint;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('matcenter-hint-open');
    
    setTimeout(() => textarea.focus(), 100);
}

// Скрыть модальное окно подсказки
function hideHintModal() {
    const overlay = document.getElementById('hintOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('matcenter-hint-open');
    
    // Сбрасываем состояние кнопок после закрытия
    resetHintModalButtons();
    activeHintTask = null;
    if (hintReturnFocus && typeof hintReturnFocus.focus === 'function') hintReturnFocus.focus();
    hintReturnFocus = null;
}

// Инициализация обработчиков модального окна подсказок
function initHintModal() {
    const saveBtn = document.getElementById('hintSaveBtn');
    const deleteBtn = document.getElementById('hintDeleteBtn');
    const cancelBtn = document.getElementById('hintCancelBtn');
    const closeBtn = document.getElementById('hintCloseBtn');
    const overlay = document.getElementById('hintOverlay');
    
    // Сохранение подсказки
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const task = activeHintTask;
            const hintText = document.getElementById('hintTextarea').value;
            if (!task) return;
            
            // Блокируем кнопку и показываем загрузку
            const originalText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<span class="spinner-small"></span> Сохранение...';
            saveBtn.style.opacity = '0.7';
            
            try {
                await pushHintToServer(task, hintText);
                if (setTaskHint(task, hintText)) {
                    
                    // Показываем успех
                    saveBtn.innerHTML = '<span class="eic eic-check" aria-hidden="true"></span> Сохранено!';
                    saveBtn.style.opacity = '1';
                    
                    // Через 500ms закрываем модалку
                    setTimeout(() => {
                        hideHintModal();
                        refreshCurrentView();
                        console.log(`✅ Подсказка для задачи №${task.numberText || task.number} сохранена`);
                    }, 500);
                }
            } catch (error) {
                // В случае ошибки возвращаем кнопку в исходное состояние
                saveBtn.disabled = false;
                saveBtn.innerHTML = originalText;
                saveBtn.style.opacity = '1';
                console.error('Ошибка сохранения:', error);
            }
        });
    }
    
    // Удаление подсказки
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async ()=>{
            const task = activeHintTask;
            if (!task) return;
            const taskLabel = task.numberText || task.number;
            if(confirm(`Удалить подсказку для задачи №${taskLabel}?`)){
                // Блокируем кнопку и показываем загрузку
                const originalText = deleteBtn.innerHTML;
                deleteBtn.disabled = true;
                deleteBtn.innerHTML = '<span class="spinner-small"></span> Удаление...';
                deleteBtn.style.opacity = '0.7';
                
                try {
                    await pushHintToServer(task,'');
                    if(setTaskHint(task,'')){
                        
                        // Показываем успех
                        deleteBtn.innerHTML = '<span class="eic eic-check" aria-hidden="true"></span> Удалено!';
                        deleteBtn.style.opacity = '1';
                        
                        // Через 500ms закрываем модалку
                        setTimeout(() => {
                            hideHintModal();
                            refreshCurrentView();
                        }, 500);
                    }
                } catch (error) {
                    // В случае ошибки возвращаем кнопку в исходное состояние
                    deleteBtn.disabled = false;
                    deleteBtn.innerHTML = originalText;
                    deleteBtn.style.opacity = '1';
                    console.error('Ошибка удаления:', error);
                }
            }
        });
    }
    
    // Отмена
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideHintModal);
    }
    
    // Закрытие через крестик
    if (closeBtn) {
        closeBtn.addEventListener('click', hideHintModal);
    }
    
    // Закрытие по клику на фон
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                hideHintModal();
            }
        });
    }
}

async function pushHintToServer(taskOrNumber, hintText) {
    const mutation = getTaskMutationParams(taskOrNumber);
    console.log(`🔄 Отправка подсказки для задачи №${mutation.taskNumber} на сервер...`);
    console.log(`   Пароль: ${authToken ? 'есть' : 'нет'}, taskNumber: ${mutation.taskNumber}, hintText length: ${hintText.length}`);
    
    try {
        const endpoint = getEndpointForTask(mutation.task || taskOrNumber);
        const payload = {
            action: 'setHint',
            taskNumber: mutation.taskNumber,
            hintText,
            grade: mutation.grade,
            taskId: mutation.taskId
        };
        let data;
        if (matcenterAuthMode === 'account') {
            data = await postMatcenterJson(endpoint, {
                ...payload,
                idToken: await getMatcenterIdToken()
            });
        } else {
            const params = new URLSearchParams({ ...payload, password: authToken || '' });
            const response = await fetch(`${endpoint}?${params.toString()}`);
            const responseText = await response.text();
            console.log('📥 Ответ сервера (raw):', responseText);
            try { data = JSON.parse(responseText); }
            catch (_) { throw new Error('Сервер вернул некорректный JSON: ' + responseText); }
        }
        
        if (!data.success) {
            console.error('❌ Сервер вернул ошибку:', data.error || 'неизвестная ошибка');
            throw new Error(data.error || 'Ошибка при сохранении подсказки на сервере');
        }
        
        console.log('✅ Подсказка успешно сохранена на сервере');
        return data;
        
    } catch (error) {
        console.error('❌ Не удалось отправить подсказку на сервер:', error);
        window.AlmanionToast?.show('Не удалось сохранить подсказку: ' + error.message, { type: 'error' });
        throw error;
    }
}

console.log('✅ Сайт загружен успешно!');
