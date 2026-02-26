// ============================================
// ПРОВЕРКА ЗНАНИЙ - Зачёт 07.02
// ============================================

// Структура тем с их ID
const TOPICS = [
    { id: 'main-definitions', name: '0. Обязательные определения' },
    // Билет №10
    { id: 'system-of-bodies', name: '10.1 Система тел' },
    { id: 'center-of-mass-def', name: '10.2 Центр масс' },
    { id: 'center-2mt', name: '10.3 Центр масс 2х МТ' },
    { id: 'center-nmt', name: '10.4 Центр масс N МТ' },
    { id: 'velocity-momentum', name: '10.5 Скорость и импульс ЦМ' },
    { id: 'theorem-cm', name: '10.6 Теорема о движении ЦМ' },
    { id: 'plane-parallel', name: '10.7 Плоскопараллельное движение' },
    // Билет №11
    { id: 'work-def', name: '11.1 Механическая работа' },
    { id: 'variable-force-work', name: '11.2 Работа переменной силы' },
    { id: 'power', name: '11.3 Мощность' },
    { id: 'efficiency', name: '11.4 КПД' },
    // Билет №12
    { id: 'work-derivation-1d', name: '12.1 Вывод работы (1D)' },
    { id: 'work-derivation-2d', name: '12.2 Вывод работы (2D)' },
    { id: 'work-derivation-curve', name: '12.3 Вывод работы (кривол.)' },
    { id: 'kinetic-energy', name: '12.4 Кинетическая энергия' },
    { id: 'kinetic-system', name: '12.5 КЭ системы тел' },
    { id: 'kinetic-momentum', name: '12.6 КЭ через импульс' },
    { id: 'theorem-kinetic', name: '12.7 Теорема о КЭ' },
    { id: 'kinetic-meaning', name: '12.8 Физический смысл КЭ' },
    { id: 'energy-law-derivation', name: '12.9 Вывод закона изменения' },
    { id: 'energy-law', name: '12.10 Закон изменения энергии' },
    { id: 'energy-conservation', name: '12.11 Закон сохранения энергии' },
    { id: 'energy-transition', name: '12.12 Переход энергии' }
];

let selectedTopics = [];
let currentDefinitions = [];
let currentIndex = 0;
let revealed = false;
let sessionMemoryStats = {}; // Статистика запоминания для текущей сессии
let rememberCount = 0;
let forgetCount = 0;
let totalRounds = 0; // Количество пройденных кругов
let allDefinitions = []; // Все извлечённые определения для повторных кругов

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initKnowledgeCheck();
});

function initKnowledgeCheck() {
    const knowledgeCheckBtn = document.getElementById('knowledgeCheckBtn');
    const topicSelectionOverlay = document.getElementById('topicSelectionOverlay');
    const knowledgeCheckOverlay = document.getElementById('knowledgeCheckOverlay');
    const selectAllBtn = document.getElementById('selectAllTopicsBtn');
    const startBtn = document.getElementById('startKnowledgeCheckBtn');
    const cancelBtn = document.getElementById('cancelTopicSelectionBtn');
    const closeBtn = document.getElementById('closeKnowledgeCheckBtn');

    // Создаём список тем для выбора
    createTopicSelectionList();

    // Обработчики событий
    if (knowledgeCheckBtn) {
        knowledgeCheckBtn.addEventListener('click', () => {
            selectedTopics = [];
            updateTopicSelectionList();
            topicSelectionOverlay.classList.remove('hidden');
        });
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const allChecked = selectedTopics.length === TOPICS.length;
            if (allChecked) {
                selectedTopics = [];
            } else {
                selectedTopics = TOPICS.map(t => t.id);
            }
            updateTopicSelectionList();
        });
    }

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (selectedTopics.length === 0) {
                alert('Пожалуйста, выберите хотя бы одну тему');
                return;
            }
            startKnowledgeCheck();
            topicSelectionOverlay.classList.add('hidden');
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            topicSelectionOverlay.classList.add('hidden');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            // Показываем финальные результаты перед закрытием
            if (rememberCount + forgetCount > 0) {
                showFinalStatistics();
            } else {
                knowledgeCheckOverlay.classList.add('hidden');
            }
        });
    }

    // Закрытие по клику на overlay
    topicSelectionOverlay.addEventListener('click', (e) => {
        if (e.target === topicSelectionOverlay) {
            topicSelectionOverlay.classList.add('hidden');
        }
    });

    knowledgeCheckOverlay.addEventListener('click', (e) => {
        if (e.target === knowledgeCheckOverlay) {
            knowledgeCheckOverlay.classList.add('hidden');
        }
    });
}

function createTopicSelectionList() {
    const list = document.getElementById('topicSelectionList');
    if (!list) return;

    list.innerHTML = '';
    
    TOPICS.forEach(topic => {
        const label = document.createElement('label');
        label.style.cssText = 'display: flex; align-items: center; padding: 0.75rem; margin-bottom: 0.5rem; cursor: pointer; border-radius: var(--border-radius-sm); transition: background 0.2s;';
        label.addEventListener('mouseenter', () => {
            label.style.background = 'var(--bg-secondary)';
        });
        label.addEventListener('mouseleave', () => {
            label.style.background = 'transparent';
        });

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = topic.id;
        checkbox.id = `topic-${topic.id}`;
        checkbox.style.marginRight = '0.75rem';
        checkbox.style.cursor = 'pointer';
        checkbox.style.width = '18px';
        checkbox.style.height = '18px';

        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                if (!selectedTopics.includes(topic.id)) {
                    selectedTopics.push(topic.id);
                }
            } else {
                selectedTopics = selectedTopics.filter(id => id !== topic.id);
            }
            updateSelectAllButton();
        });

        const span = document.createElement('span');
        span.textContent = topic.name;
        span.style.flex = '1';
        span.style.userSelect = 'none';

        label.appendChild(checkbox);
        label.appendChild(span);
        list.appendChild(label);
    });

    updateSelectAllButton();
}

function updateTopicSelectionList() {
    TOPICS.forEach(topic => {
        const checkbox = document.getElementById(`topic-${topic.id}`);
        if (checkbox) {
            checkbox.checked = selectedTopics.includes(topic.id);
        }
    });
    updateSelectAllButton();
}

function updateSelectAllButton() {
    const selectAllBtn = document.getElementById('selectAllTopicsBtn');
    if (selectAllBtn) {
        const allChecked = selectedTopics.length === TOPICS.length;
        selectAllBtn.textContent = allChecked ? 'Снять всё' : 'Выбрать всё';
    }
}

function startKnowledgeCheck() {
    // ОБНУЛЯЕМ всю статистику при новом запуске
    sessionMemoryStats = {};
    rememberCount = 0;
    forgetCount = 0;
    totalRounds = 0;
    
    // Извлекаем определения из выбранных тем
    const extractedDefinitions = [];
    
    selectedTopics.forEach(topicId => {
        const topicElement = document.getElementById(topicId);
        if (topicElement) {
            const definitionBoxes = topicElement.querySelectorAll('.definition-box');
            definitionBoxes.forEach(box => {
                const strongElement = box.querySelector('strong');
                if (strongElement) {
                    // Клонируем strong элемент и удаляем KaTeX элементы для получения чистого текста
                    const strongClone = strongElement.cloneNode(true);
                    // Удаляем все отрендеренные KaTeX элементы
                    const katexElements = strongClone.querySelectorAll('.katex');
                    katexElements.forEach(el => el.remove());
                    
                    const term = strongClone.textContent.trim();
                    const termHTML = strongElement.innerHTML; // Сохраняем HTML термина для рендеринга
                    
                    // Клонируем box и удаляем strong элемент для получения определения
                    const definitionClone = box.cloneNode(true);
                    const strongInClone = definitionClone.querySelector('strong');
                    if (strongInClone) {
                        strongInClone.remove();
                    }
                    // Очищаем текст от лишних пробелов и переносов
                    let definition = definitionClone.textContent.trim();
                    // Удаляем KaTeX формулы из текста (они будут отрендерены отдельно)
                    definition = definition.replace(/\\\[[\s\S]*?\\\]/g, '[формула]');
                    definition = definition.replace(/\\\([\s\S]*?\\\)/g, '[формула]');
                    definition = definition.replace(/\$[\s\S]*?\$/g, '[формула]');
                    
                    // Если определение пустое, пропускаем
                    if (definition && definition.length > 0) {
                        // Сохраняем оригинальный HTML для отображения
                        const definitionHTML = box.innerHTML;
                        const defId = `${topicId}_${term}`;
                        extractedDefinitions.push({
                            id: defId,
                            term: term,
                            termHTML: termHTML,
                            definition: definition,
                            definitionHTML: definitionHTML,
                            topicId: topicId
                        });
                        
                        // Инициализируем статистику для этой сессии
                        if (!sessionMemoryStats[defId]) {
                            sessionMemoryStats[defId] = {
                                remember: 0,
                                forget: 0,
                                lastSeen: 0
                            };
                        }
                    }
                }
            });
        }
    });

    if (extractedDefinitions.length === 0) {
        alert('В выбранных темах не найдено определений');
        return;
    }

    // Сохраняем все определения для повторных кругов
    allDefinitions = extractedDefinitions;
    
    // Создаём умный список с повторениями для первого круга
    startNewRound();
    
    const knowledgeCheckOverlay = document.getElementById('knowledgeCheckOverlay');
    knowledgeCheckOverlay.classList.remove('hidden');
}

function startNewRound() {
    totalRounds++;
    currentDefinitions = createSmartDefinitionList(allDefinitions);
    currentIndex = 0;
    revealed = false;
    showCurrentDefinition();
}

// Создаём умный список определений с повторениями для плохо запомненных
function createSmartDefinitionList(definitions) {
    const list = [];
    
    definitions.forEach(def => {
        const stats = sessionMemoryStats[def.id];
        let repeatCount = 3; // Минимум 3 раза для каждого определения
        
        if (stats && (stats.remember + stats.forget) > 0) {
            const forgetRatio = stats.forget / Math.max(1, stats.remember + stats.forget);
            
            // Чем больше забываний в ЭТОЙ сессии, тем чаще повторяем
            if (forgetRatio > 0.7) {
                repeatCount = 5; // Очень плохо помню - 5 раз
            } else if (forgetRatio > 0.5) {
                repeatCount = 4; // Плохо помню - 4 раза
            } else if (forgetRatio > 0.3) {
                repeatCount = 3; // Средне - 3 раза
            } else {
                // Хорошо помню - всё равно минимум 3 раза
                repeatCount = 3;
            }
        }
        
        // Добавляем определение нужное количество раз
        for (let i = 0; i < repeatCount; i++) {
            list.push(def);
        }
    });
    
    // Перемешиваем с интервалами (чтобы повторения не шли подряд)
    return shuffleWithSpacing(list);
}

// Перемешиваем список, но избегаем одинаковых определений подряд
function shuffleWithSpacing(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    // Пытаемся разнести одинаковые определения
    for (let i = 1; i < shuffled.length; i++) {
        if (shuffled[i].id === shuffled[i - 1].id) {
            // Ищем место для обмена
            for (let j = i + 1; j < shuffled.length; j++) {
                if (shuffled[j].id !== shuffled[i].id && shuffled[j].id !== shuffled[i - 1].id) {
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                    break;
                }
            }
        }
    }
    
    return shuffled;
}

function showCurrentDefinition() {
    if (currentIndex >= currentDefinitions.length) {
        // Автоматически переходим к следующему кругу
        nextDefinition();
        return;
    }

    const def = currentDefinitions[currentIndex];
    const content = document.getElementById('knowledgeCheckContent');
    const progress = document.getElementById('knowledgeCheckProgress');

    if (progress) {
        progress.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span style="font-weight: 600;">Круг ${totalRounds}</span>
                <span style="color: #22c55e;">✓ ${rememberCount}</span>
                <span style="color: #ef4444;">✗ ${forgetCount}</span>
            </div>
        `;
    }

    revealed = false;

    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 1rem;">
                    ${TOPICS.find(t => t.id === def.topicId)?.name || ''}
                </div>
                <div id="termDisplay" style="font-size: 1.5rem; font-weight: 600; color: var(--primary-color); margin-bottom: 2rem; cursor: pointer; padding: 1.5rem; background: var(--bg-secondary); border-radius: var(--border-radius); transition: all 0.3s; user-select: none; box-shadow: var(--shadow-sm);" onclick="window.revealDefinition()">
                    ${def.termHTML || escapeHtml(def.term)}
                </div>
                <div id="definitionDisplay" style="display: none; text-align: left; padding: 1.5rem; background: var(--card-bg); border-radius: var(--border-radius); margin-top: 1rem; border: 2px solid var(--accent-color);">
                    ${def.definitionHTML}
                </div>
                <div id="memoryButtonsContainer" style="display: none;">
                    <div class="memory-buttons">
                        <button class="memory-btn memory-btn-forget" onclick="window.markAsForget()">
                            <span style="font-size: 1.2rem;">✗</span>
                            Не помню
                        </button>
                        <button class="memory-btn memory-btn-remember" onclick="window.markAsRemember()">
                            <span style="font-size: 1.2rem;">✓</span>
                            Помню
                        </button>
                    </div>
                </div>
                <div id="instructionText" style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                    Нажмите на термин, чтобы увидеть определение
                </div>
            </div>
        `;

        // Рендерим LaTeX формулы в термине и определении после небольшой задержки
        setTimeout(() => {
            if (typeof renderMathInElement !== 'undefined') {
                const termDisplay = document.getElementById('termDisplay');
                const definitionDisplay = document.getElementById('definitionDisplay');
                
                if (termDisplay) {
                    renderMathInElement(termDisplay, {
                        delimiters: [
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '$', right: '$', display: false}
                        ],
                        throwOnError: false,
                        trust: true
                    });
                }
                
                if (definitionDisplay) {
                    renderMathInElement(definitionDisplay, {
                        delimiters: [
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false},
                            {left: '$', right: '$', display: false}
                        ],
                        throwOnError: false,
                        trust: true
                    });
                }
            }
        }, 100);
    }
}

function revealDefinition() {
    if (revealed) return;
    
    const definitionDisplay = document.getElementById('definitionDisplay');
    const termDisplay = document.getElementById('termDisplay');
    const memoryButtonsContainer = document.getElementById('memoryButtonsContainer');
    const instructionText = document.getElementById('instructionText');
    
    if (definitionDisplay) {
        definitionDisplay.style.display = 'block';
        definitionDisplay.style.animation = 'fadeIn 0.3s ease-in';
        // Рендерим LaTeX формулы при показе определения
        if (typeof renderMathInElement !== 'undefined') {
            renderMathInElement(definitionDisplay, {
                delimiters: [
                    {left: '\\[', right: '\\]', display: true},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '$', right: '$', display: false}
                ],
                throwOnError: false,
                trust: true
            });
        }
    }
    
    if (termDisplay) {
        termDisplay.style.background = 'var(--accent-color)';
        termDisplay.style.color = 'white';
        termDisplay.style.transform = 'scale(0.98)';
        termDisplay.style.cursor = 'default';
        // Убираем обработчик после первого клика
        termDisplay.setAttribute('onclick', '');
        termDisplay.onclick = null;
    }
    
    if (memoryButtonsContainer) {
        memoryButtonsContainer.style.display = 'block';
        memoryButtonsContainer.style.animation = 'fadeIn 0.3s ease-in';
    }
    
    if (instructionText) {
        instructionText.textContent = 'Отметьте, помните ли вы это определение';
    }
    
    revealed = true;
}

function markAsRemember() {
    if (!revealed || currentIndex >= currentDefinitions.length) return;
    
    const def = currentDefinitions[currentIndex];
    sessionMemoryStats[def.id].remember++;
    sessionMemoryStats[def.id].lastSeen = Date.now();
    rememberCount++;
    
    // Переходим к следующему определению
    nextDefinition();
}

function markAsForget() {
    if (!revealed || currentIndex >= currentDefinitions.length) return;
    
    const def = currentDefinitions[currentIndex];
    sessionMemoryStats[def.id].forget++;
    sessionMemoryStats[def.id].lastSeen = Date.now();
    forgetCount++;
    
    // Переходим к следующему определению
    nextDefinition();
}

function nextDefinition() {
    currentIndex++;
    if (currentIndex < currentDefinitions.length) {
        showCurrentDefinition();
    } else {
        // Закончились определения - автоматически создаём новый круг
        totalRounds++;
        currentDefinitions = createSmartDefinitionList(allDefinitions);
        currentIndex = 0;
        showCurrentDefinition();
    }
}

function showFinalStatistics() {
    const content = document.getElementById('knowledgeCheckContent');
    const progress = document.getElementById('knowledgeCheckProgress');

    if (progress) {
        progress.textContent = 'Завершено';
    }

    const successRate = rememberCount / Math.max(1, rememberCount + forgetCount);
    const successPercent = Math.round(successRate * 100);
    
    let emoji = '✅';
    let message = 'Отличный результат!';
    if (successPercent < 50) {
        emoji = '📚';
        message = 'Есть над чем поработать';
    } else if (successPercent < 75) {
        emoji = '👍';
        message = 'Хороший результат!';
    }

    if (content) {
        content.innerHTML = `
            <div style="text-align: center; padding: 2rem;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">${emoji}</div>
                <h3 style="margin-bottom: 1rem;">${message}</h3>
                
                <div class="memory-stats">
                    <div class="memory-stat remember">
                        <div class="memory-stat-value">${rememberCount}</div>
                        <div class="memory-stat-label">Помню</div>
                    </div>
                    <div class="memory-stat forget">
                        <div class="memory-stat-value">${forgetCount}</div>
                        <div class="memory-stat-label">Не помню</div>
                    </div>
                    <div class="memory-stat total">
                        <div class="memory-stat-value">${successPercent}%</div>
                        <div class="memory-stat-label">Успешность</div>
                    </div>
                </div>
                
                <p style="color: var(--text-secondary); margin: 1.5rem 0;">
                    Пройдено кругов: <strong>${totalRounds}</strong><br>
                    Всего проверено: <strong>${rememberCount + forgetCount}</strong> ответов
                </p>
                
                <button onclick="window.closeKnowledgeCheck()" class="auth-submit" style="background: var(--accent-color);">
                    Закрыть
                </button>
            </div>
        `;
    }
}

function closeKnowledgeCheck() {
    const knowledgeCheckOverlay = document.getElementById('knowledgeCheckOverlay');
    knowledgeCheckOverlay.classList.add('hidden');
}

function restartKnowledgeCheck() {
    const knowledgeCheckOverlay = document.getElementById('knowledgeCheckOverlay');
    const topicSelectionOverlay = document.getElementById('topicSelectionOverlay');
    
    knowledgeCheckOverlay.classList.add('hidden');
    topicSelectionOverlay.classList.remove('hidden');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Экспортируем функции для использования в HTML
window.revealDefinition = revealDefinition;
window.restartKnowledgeCheck = restartKnowledgeCheck;
window.markAsRemember = markAsRemember;
window.markAsForget = markAsForget;
window.closeKnowledgeCheck = closeKnowledgeCheck;