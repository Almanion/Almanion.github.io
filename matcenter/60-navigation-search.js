// ============================================
// СТАТИСТИКА
// ============================================

function getGradeTitle(gradeId) {
    const section = GRADE_SECTIONS.find(g => g.id === gradeId);
    return section ? section.title : gradeId;
}

function normalizeAllTasks(tasks) {
    if (!Array.isArray(tasks)) return [];
    return tasks.map(task => ({
        ...task,
        grade: normalizeMatcenterGrade(task.grade, getTaskEndpointIndex(task))
    }));
}

function getTasksForCurrentGrade() {
    return allTasks.filter(t => t.grade === currentGrade);
}

// Является ли грейд летней серией (там нет статусов, разделы — по темам).
function isSummerGrade(grade) {
    return typeof grade === 'string' && grade.indexOf('summer') !== -1;
}

// Разделы летней серии 9-10 по номерам реальных задач.
// bannerNum — номер псевдо-задачи-заголовка темы (вводный текст с названием раздела).
// Если структура серии изменится — править здесь.
const SUMMER_SECTIONS = {
    'grade-summer-9-10': [
        { id: 'topic-mayskie',  title: 'Майские сборы',              bannerNum: 0.5,  minNum: 1,  maxNum: 8 },
        { id: 'topic-combin',   title: 'Комбинаторика',               bannerNum: 8.5,  minNum: 9,  maxNum: 13 },
        { id: 'topic-algebra',  title: 'Алгебра',                     bannerNum: 13.5, minNum: 14, maxNum: 17 },
        { id: 'topic-numbers',  title: 'Теория чисел',                bannerNum: 17.5, minNum: 18, maxNum: 19 },
        { id: 'topic-analysis', title: 'Математический анализ',       bannerNum: 19.5, minNum: 20, maxNum: 22 },
        { id: 'topic-analytic', title: 'Аналитическая теория чисел',  bannerNum: 22.5, minNum: 23, maxNum: 25 },
        { id: 'topic-mersenne', title: 'Простота чисел Мерсенна',     bannerNum: 25.5, minNum: 26, maxNum: 40 },
        { id: 'topic-geometry', title: 'Геометрия',                   bannerNum: 40.5, minNum: 41, maxNum: 59 },
    ]
};

function getSummerSectionsFor(grade) {
    return SUMMER_SECTIONS[grade] || [];
}

function getSummerSectionById(grade, id) {
    return getSummerSectionsFor(grade).find(s => s.id === id) || null;
}

function syncGradeNavUI() {
    document.querySelectorAll('.grade-link, .grade-card').forEach(el => {
        const isActive = el.dataset.grade === currentGrade;
        el.classList.toggle('active', isActive);
        if (el.classList.contains('grade-card')) {
            el.setAttribute('aria-pressed', String(isActive));
        } else if (isActive) {
            el.setAttribute('aria-current', 'page');
        } else {
            el.removeAttribute('aria-current');
        }
    });

    const title = getGradeTitle(currentGrade);
    const navTitle = document.getElementById('gradeNavTitle');
    if (navTitle) navTitle.textContent = title;

    // Помечаем body — у летних серий другие UI-правила (нет статусов, темы вместо фильтров)
    document.body.classList.toggle('is-summer-grade', isSummerGrade(currentGrade));

    // Заголовок секции #all-tasks учитывает текущую тему (для летних серий)
    updateAllTasksTitleForFilter();
}

// Заголовок секции #all-tasks — для летних серий показываем имя темы, иначе «… — все задачи».
function updateAllTasksTitleForFilter() {
    const el = document.getElementById('allTasksTitle');
    if (!el) return;
    const gradeTitle = getGradeTitle(currentGrade);
    if (typeof currentFilter === 'string' && currentFilter.indexOf('topic-') === 0) {
        const section = getSummerSectionById(currentGrade, currentFilter);
        if (section) {
            el.textContent = `${gradeTitle} — ${section.title}`;
            return;
        }
    }
    el.textContent = `${gradeTitle} — все задачи`;
}

// Перестраивает список пунктов навигации в сайдбаре под текущий грейд.
// Для летних серий — «Все задачи» + темы (Майские сборы, Алгебра, …).
// Для обычных классов — стандартные «Все задачи / Текущая серия / Откладыши / Неразобранные».
function rebuildNavMenu(grade) {
    const navTitleEl = document.getElementById('gradeNavTitle');
    if (!navTitleEl) return;
    const navSection = navTitleEl.closest('.nav-section');
    if (!navSection) return;
    const listEl = navSection.querySelector('ul');
    if (!listEl) return;

    const items = [{ id: 'all-tasks', title: 'Все задачи' }];
    if (isSummerGrade(grade)) {
        getSummerSectionsFor(grade).forEach(s => {
            items.push({ id: s.id, title: s.title });
        });
    } else {
        items.push({ id: 'current-series', title: 'Текущая серия' });
        items.push({ id: 'postponed',      title: 'Откладыши' });
        items.push({ id: 'unsolved',       title: 'Неразобранные' });
    }

    listEl.innerHTML = items.map(item => {
        const isActive = item.id === currentFilter ? ' active' : '';
        return `<li><a href="#${item.id}" class="nav-link${isActive}">${escapeHtml(item.title)}</a></li>`;
    }).join('');
}

// Правильное склонение русских числительных: 1 задача, 2 задачи, 5 задач
function pluralizeTasks(n) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'задача';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи';
    return 'задач';
}

// Обновление счётчиков задач на карточках классов
function updateGradeCounts() {
    GRADE_SECTIONS.forEach(g => {
        // Псевдо-задачи (дробные номера) в счётчик не идут.
        const count = allTasks.filter(t => t.grade === g.id && Number.isInteger(t.number)).length;
        const countEl = document.querySelector(`[data-count-grade="${g.id}"]`);
        if (countEl) countEl.textContent = count;
        // Меняем подпись «задача/задачи/задач» под числом
        const card = document.querySelector(`.grade-card[data-grade="${g.id}"]`);
        const subEl = card ? card.querySelector('.grade-card-sub') : null;
        const taskWord = pluralizeTasks(count);
        if (subEl) subEl.textContent = taskWord;
        if (card) {
            const sectionType = card.querySelector('.grade-card-eyebrow')?.textContent?.trim() || 'Раздел';
            const sectionTitle = card.querySelector('.grade-card-title')?.textContent?.trim() || g.title;
            card.setAttribute('aria-label', `${sectionType} ${sectionTitle}, ${count} ${taskWord}`);
        }
    });
}

// Синхронизация active-классов на nav-link и стат-картах
function syncFilterUI() {
    document.querySelectorAll('.nav-link').forEach(l => {
        const href = l.getAttribute('href') || '';
        l.classList.toggle('active', href === `#${currentFilter}`);
    });
    document.querySelectorAll('.stat-card.clickable[data-filter]').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === currentFilter);
    });
    // В летних сериях select-фильтр работает как переключатель тем —
    // обновляем выбранное значение, чтобы оно соответствовало активной секции.
    if (isSummerGrade(currentGrade)) {
        const wantValue = currentFilter.indexOf('topic-') === 0 ? currentFilter : '';
        ['statusFilter', 'mobileStatusFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (Array.from(el.options).some(o => o.value === wantValue)) {
                el.value = wantValue;
            }
            el.classList.toggle('has-filter', el.value !== '');
        });
    }
}

function resetMatcenterTaskFilters() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const mobileSearchClear = document.getElementById('mobileSearchClear');

    if (searchInput) searchInput.value = '';
    if (statusFilterEl) statusFilterEl.value = '';
    if (mobileSearchInput) mobileSearchInput.value = '';
    if (mobileStatusFilter) mobileStatusFilter.value = '';
    if (searchClearBtn) searchClearBtn.classList.remove('visible');
    if (mobileSearchClear) mobileSearchClear.classList.remove('visible');
    if (statusFilterEl) statusFilterEl.classList.remove('has-filter');
    if (mobileStatusFilter) mobileStatusFilter.classList.remove('has-filter');

    searchStatusFilter = 'all';
    currentFilter = 'all-tasks';
    try { safeSet(FILTER_STORAGE_KEY, currentFilter); } catch (_) {}

    showTaskView('all-tasks');
    syncFilterUI();
    updateAllTasksTitleForFilter();
}

function setCurrentGrade(gradeId) {
    if (!GRADE_SECTIONS.some(g => g.id === gradeId)) return;

    const gradeChanged = gradeId !== currentGrade;
    if (!gradeChanged) return;
    resetMatcenterTaskFilters();

    currentGrade = gradeId;
    try {
        safeSet(GRADE_STORAGE_KEY, gradeId);
    } catch (e) { /* ignore */ }

    // Перестраиваем sidebar nav под новый грейд (его список пунктов меняется)
    rebuildNavMenu(currentGrade);
    rebuildStatusFilters(currentGrade);

    syncGradeNavUI();
    syncFilterUI();
    updateStatistics(getTasksForCurrentGrade());
    refreshCurrentView();

    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'auto' });
}

function initGradeNavigation() {
    try {
        const saved = safeGet(GRADE_STORAGE_KEY);
        if (saved && GRADE_SECTIONS.some(g => g.id === saved)) {
            currentGrade = saved;
        }
    } catch (e) { /* ignore */ }

    rebuildNavMenu(currentGrade);
    syncGradeNavUI();

    document.querySelectorAll('.grade-link, .grade-card').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const gradeId = link.dataset.grade;
            if (gradeId) setCurrentGrade(gradeId);
            if (typeof closeMobileMenu === 'function') closeMobileMenu();
        });
    });
}

function hideAllTaskViews() {
    TASK_VIEW_IDS.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

function showTaskView(viewId) {
    hideAllTaskViews();
    const el = document.getElementById(viewId);
    if (el) el.style.display = 'block';
}

function refreshCurrentView() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const hasSearch = searchInput && normalizeSearchText(searchInput.value);
    // В летних сериях select-фильтр работает как переключатель тем,
    // его значение уже отражено в currentFilter — повторно не применяем.
    const hasStatusFilter = !isSummerGrade(currentGrade)
        && statusFilterEl && statusFilterEl.value;

    if (hasSearch || hasStatusFilter) {
        runSearch();
    } else {
        filterAndDisplayTasks(currentFilter);
    }
}

function showEmptyGradeMessage(container) {
    const title = escapeHtml(getGradeTitle(currentGrade));
    container.innerHTML = `
        <div class="empty-grade-message">
            <span class="empty-grade-icon"><span class="eic eic-folder" aria-hidden="true"></span></span>
            <p>В разделе «${title}» пока нет задач</p>
        </div>
    `;
}

function updateStatistics(tasks) {
    // Псевдо-задачи (заголовки разделов / вводные тексты) — дробные номера,
    // их в статистике не учитываем.
    const realTasks = tasks.filter(t => Number.isInteger(t.number));
    const total = realTasks.length;
    const current = realTasks.filter(t => t.status === 'Н').length; // Текущая серия: "Н"
    const postponed = realTasks.filter(t => t.status === 'От' || t.status === 'П').length; // Откладыши: "От" + "П"
    const unsolved = current + postponed;

    document.getElementById('totalTasks').textContent = total;
    document.getElementById('unsolvedTasks').textContent = unsolved;
    document.getElementById('currentSeries').textContent = current;
    document.getElementById('postponedTasks').textContent = postponed;

    // Обновляем заголовки секций с указанием класса для согласованности
    const gradeTitle = getGradeTitle(currentGrade);
    updateSectionTitle('currentSeriesTitle', `${gradeTitle} — текущая серия (${current})`);
    updateSectionTitle('postponedTitle', `${gradeTitle} — откладыши (${postponed})`);
    updateSectionTitle('unsolvedTitle', `${gradeTitle} — неразобранные (${unsolved})`);

    // Обновляем счётчики на карточках разделов (по всем классам)
    updateGradeCounts();

    // Обновляем полосу личного прогресса под выбранный раздел
    updatePersonalSolvedProgress();
}

function updateSectionTitle(elementId, title) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = title;
}

// ============================================
// UI HELPERS
// ============================================

function initStatsClick() {
    document.querySelectorAll('.stat-card.clickable[data-filter]').forEach(card => {
        const activate = () => {
            const filterId = card.dataset.filter;
            if (filterId) setCurrentFilter(filterId, { scrollTop: true });
        };
        card.addEventListener('click', activate);
        card.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            activate();
        });
    });
}

function initEscapeKey() {
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const hintOverlay = document.getElementById('hintOverlay');
        if (hintOverlay && !hintOverlay.classList.contains('hidden')) {
            hideHintModal();
        }
    });
}

function initHintSwipe() {
    const overlay  = document.getElementById('hintOverlay');
    const modal    = document.getElementById('hintModal');
    const dragZone = document.getElementById('hintDragHandle');
    const header   = modal ? modal.querySelector('.hint-modal-header') : null;
    if (!overlay || !modal || overlay.dataset.hintSwipeInit) return;
    overlay.dataset.hintSwipeInit = 'true';

    let startY = 0, currentY = 0, tracking = false;

    function onTouchStart(e) {
        if (window.innerWidth > 768) return;
        startY  = e.touches[0].clientY;
        currentY = startY;
        tracking = true;
        modal.style.transition = 'none';
    }

    // Слушаем только drag-handle и шапку — они не скроллятся,
    // поэтому passive:true не мешает preventDefault в touchmove
    if (dragZone) dragZone.addEventListener('touchstart', onTouchStart, { passive: true });
    if (header)   header.addEventListener('touchstart',   onTouchStart, { passive: true });

    // Движение — на document, чтобы палец мог уходить за границу шапки
    document.addEventListener('touchmove', (e) => {
        if (!tracking) return;
        currentY = e.touches[0].clientY;
        const dy = currentY - startY;
        if (dy > 0) {
            e.preventDefault();
            modal.style.transform = `translateY(${dy}px)`;
        } else {
            modal.style.transform = '';
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        if (!tracking) return;
        tracking = false;
        const dy = currentY - startY;
        if (dy > 80) {
            // Анимируем вниз, затем закрываем
            modal.style.transition = 'transform 0.22s ease-out';
            modal.style.transform  = `translateY(110%)`;
            setTimeout(() => {
                hideHintModal();
                modal.style.transform  = '';
                modal.style.transition = '';
            }, 220);
        } else {
            // Возврат на место
            modal.style.transition = 'transform 0.25s ease-out';
            modal.style.transform  = '';
            setTimeout(() => { modal.style.transition = ''; }, 250);
        }
    });
}

// ============================================
// НАВИГАЦИЯ
// ============================================

function initMatCenterNavigation() {
    // nav-link могут пересоздаваться при смене грейда — делегируем клик
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.nav-link');
        if (!link) return;
        if (!link.closest('.nav-menu')) return; // только из sidebar-меню
        e.preventDefault();
        const targetId = (link.getAttribute('href') || '').substring(1);
        if (targetId) setCurrentFilter(targetId, { scrollTop: true });
        if (typeof closeMobileMenu === 'function') closeMobileMenu();
    });
}

// Разрешённые фильтры для текущего грейда.
function isAllowedFilter(filterId) {
    if (TASK_VIEW_IDS.includes(filterId)) return true;
    if (filterId.indexOf('topic-') === 0) {
        return !!getSummerSectionById(currentGrade, filterId);
    }
    return false;
}

// Единая точка смены активной секции: применяет поиск/фильтр и обновляет UI
function setCurrentFilter(filterId, opts = {}) {
    if (!isAllowedFilter(filterId)) return;

    currentFilter = filterId;
    try { safeSet(FILTER_STORAGE_KEY, filterId); } catch (e) { /* ignore */ }

    // Темы летних серий рендерятся внутри секции #all-tasks
    const viewId = filterId.indexOf('topic-') === 0 ? 'all-tasks' : filterId;
    showTaskView(viewId);
    syncFilterUI();
    updateAllTasksTitleForFilter();
    refreshCurrentView(); // сам выберет runSearch() или filterAndDisplayTasks()

    if (opts.scrollTop) {
        if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: 'auto' });
    }
}

// Возвращает задачи раздела + его заголовочный баннер + переходные тексты внутри.
function filterTasksByTopic(tasks, topicSection) {
    return tasks.filter(t => {
        if (Number.isInteger(t.number)) {
            return t.number >= topicSection.minNum && t.number <= topicSection.maxNum;
        }
        // Заголовочный баннер темы (например, 13.5 «Алгебра» с вводным текстом про
        // квазилинеаризацию) — показываем перед задачами темы.
        if (t.number === topicSection.bannerNum) return true;
        // Внутренние переходные тексты (26.5, 28.5, 32.5 — внутри Мерсенна) попадают
        // строго между min и max своей темы.
        return t.number > topicSection.minNum && t.number < topicSection.maxNum;
    });
}

function filterAndDisplayTasks(filterId) {
    currentFilter = filterId;
    const gradeTasks = getTasksForCurrentGrade();
    let filteredTasks = [];
    let containerId = 'tasksContainer';

    if (filterId.indexOf('topic-') === 0) {
        const section = getSummerSectionById(currentGrade, filterId);
        filteredTasks = section ? filterTasksByTopic(gradeTasks, section) : gradeTasks;
        containerId = 'tasksContainer';
    } else {
        switch (filterId) {
            case 'all-tasks':
                filteredTasks = gradeTasks;
                containerId = 'tasksContainer';
                break;
            case 'current-series':
                filteredTasks = gradeTasks.filter(t => t.status === 'Н');
                containerId = 'currentSeriesContainer';
                break;
            case 'postponed':
                filteredTasks = gradeTasks.filter(t => t.status === 'От' || t.status === 'П');
                containerId = 'postponedContainer';
                break;
            case 'unsolved':
                filteredTasks = gradeTasks.filter(t => t.status === 'Н' || t.status === 'От' || t.status === 'П');
                containerId = 'unsolvedContainer';
                break;
            default:
                filteredTasks = gradeTasks;
                containerId = 'tasksContainer';
        }
    }

    displayTasks(filteredTasks, containerId);
}

// Получить задачи для текущего фильтра
function getTasksForCurrentFilter() {
    const gradeTasks = getTasksForCurrentGrade();

    if (currentFilter.indexOf('topic-') === 0) {
        const section = getSummerSectionById(currentGrade, currentFilter);
        return section ? filterTasksByTopic(gradeTasks, section) : gradeTasks;
    }

    switch (currentFilter) {
        case 'all-tasks':
            return gradeTasks;
        case 'current-series':
            return gradeTasks.filter(t => t.status === 'Н');
        case 'postponed':
            return gradeTasks.filter(t => t.status === 'От' || t.status === 'П');
        case 'unsolved':
            return gradeTasks.filter(t => t.status === 'Н' || t.status === 'От' || t.status === 'П');
        default:
            return gradeTasks;
    }
}

// ============================================
// ПОИСК
// ============================================

// Перестраивает опции select-фильтров под текущий грейд:
// — летние серии → выбор темы (Все темы / Майские сборы / Алгебра / …);
// — обычные классы → выбор статуса (Все / Серия / Подсказка / Отложена / Разобрано).
function rebuildStatusFilters(grade) {
    const desktop = document.getElementById('statusFilter');
    const mobile  = document.getElementById('mobileStatusFilter');
    const summer  = isSummerGrade(grade);

    const opts = summer
        ? [
            { value: '', label: 'Все темы' },
            ...getSummerSectionsFor(grade).map(s => ({ value: s.id, label: s.title }))
        ]
        : [
            { value: '',   label: 'Все' },
            { value: 'Н',  label: 'Серия' },
            { value: 'П',  label: 'Подсказка' },
            { value: 'От', label: 'Отложена' },
            { value: 'Р',  label: 'Разобрано' }
        ];

    [desktop, mobile].forEach(sel => {
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = opts.map(o =>
            `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`
        ).join('');
        const hasPrev = opts.some(o => o.value === prev);
        sel.value = hasPrev ? prev : '';
        sel.classList.toggle('has-filter', sel.value !== '');
    });
}

function initStatusFilter() {
    const statusFilterEl = document.getElementById('statusFilter');
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');

    function syncFilterClass(el) {
        if (!el) return;
        el.classList.toggle('has-filter', el.value !== '');
    }

    function handleChange(value, mirror) {
        if (mirror) {
            mirror.value = value;
            syncFilterClass(mirror);
        }
        if (isSummerGrade(currentGrade)) {
            // В летних сериях select — это переключатель тем
            setCurrentFilter(value || 'all-tasks');
        } else {
            // В обычных классах — фильтр по статусу
            searchStatusFilter = value || 'all';
            runSearch();
        }
    }

    if (statusFilterEl) {
        statusFilterEl.addEventListener('change', () => {
            syncFilterClass(statusFilterEl);
            handleChange(statusFilterEl.value, mobileStatusFilter);
        });
    }

    if (mobileStatusFilter) {
        mobileStatusFilter.addEventListener('change', () => {
            syncFilterClass(mobileStatusFilter);
            handleChange(mobileStatusFilter.value, statusFilterEl);
        });
    }

    // Изначальная сборка опций под стартовый грейд
    rebuildStatusFilters(currentGrade);

    // Начальная синхронизация значения (если что-то сохранилось)
    const initialValue = (statusFilterEl && statusFilterEl.value)
        || (mobileStatusFilter && mobileStatusFilter.value)
        || '';
    if (statusFilterEl) statusFilterEl.value = initialValue;
    if (mobileStatusFilter) mobileStatusFilter.value = initialValue;
    syncFilterClass(statusFilterEl);
    syncFilterClass(mobileStatusFilter);
    if (!isSummerGrade(currentGrade)) {
        searchStatusFilter = initialValue || 'all';
    }
}

function getContainerIdForFilter() {
    const map = { 'all-tasks': 'tasksContainer', 'current-series': 'currentSeriesContainer', 'postponed': 'postponedContainer', 'unsolved': 'unsolvedContainer' };
    return map[currentFilter] || 'tasksContainer';
}

function normalizeSearchText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/\s+/g, ' ')
        .trim();
}

function splitSearchQuery(query) {
    const normalized = normalizeSearchText(query);
    if (!normalized) return [];

    const tokens = [];
    const regex = /"([^"]+)"|(\S+)/g;
    let match;

    while ((match = regex.exec(normalized)) !== null) {
        const token = normalizeSearchText(match[1] || match[2]);
        if (token) tokens.push(token);
    }

    return tokens;
}

function taskMatchesSearch(task, queryTokens, fullQuery) {
    const haystack = normalizeSearchText([
        task.number,
        task.numberText,
        task.description,
        task.hint
    ].join(' '));

    // Быстрый путь: вся фраза есть целиком.
    if (fullQuery && haystack.includes(fullQuery)) return true;

    // Иначе каждая часть запроса должна присутствовать.
    return queryTokens.every(token => haystack.includes(token));
}

// ============================================
// РУССКИЙ СТЕММЕР
// ============================================

// Упрощённый стеммер: отрезает типичные русские окончания.
// Возвращает приближённый корень слова (≥ 3 букв).
function roughStemRu(word) {
    if (word.length <= 3) return word;
    const w = word.toLowerCase();

    // От длинных к коротким — важен порядок
    const suffixes = [
        'ениями','аниями','ениях','аниях','ениям','аниям',
        'ностью','ностей','ностям','ностях','ностями',
        'ений','аний','ением','анием','ениях','аниях',
        'ения','ание','ению','анию',
        'ости','ость','ести','есть',
        'ться','ться',
        'ами','ями','ими','ыми',
        'ого','его','ому','ему',
        'ах','ях','ам','ям',
        'ым','им','ых','их',
        'ов','ев',
        'ой','ей','ую','юю',
        'ья','ью','ьи',
        'ся','сь','ть','ти',
        'ый','ий','ые','ие',
        'ая','яя','ое','ее',
        'а','я','у','ю','е','о','и','ы',
    ];

    for (const s of suffixes) {
        if (w.endsWith(s) && w.length - s.length >= 3) {
            return w.slice(0, w.length - s.length);
        }
    }
    return w;
}

// Проверяет, совпадает ли слово запроса с любым словом в тексте
// (точно или через стеммер)
function matchWordRu(qWord, numStr, desc) {
    // Прямое совпадение
    if (numStr.includes(qWord) || desc.includes(qWord)) return true;

    // Стемминг только для слов 4+ символов (не цифр)
    if (qWord.length < 4 || /^\d+$/.test(qWord)) return false;

    const qStem = roughStemRu(qWord);
    if (qStem.length < 3) return false;

    // Разбиваем описание на слова и сравниваем стеммы
    const descWords = desc.split(/[\s,;:.!?()\[\]«»\-–—\/]+/);
    return descWords.some(dWord => {
        if (dWord.length < 3) return false;
        // Описательное слово начинается с корня запроса
        if (dWord.startsWith(qStem)) return true;
        // Совпадение по стеммам
        const dStem = roughStemRu(dWord);
        return dStem === qStem;
    });
}

function runSearch() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const searchTerm = searchInput ? searchInput.value : '';
    const normalizedTerm = normalizeSearchText(searchTerm);
    // В летних сериях значение select — это topic-id, а не статус.
    // Тематический фильтр применяется через currentFilter в getTasksForCurrentFilter().
    const activeStatus = !isSummerGrade(currentGrade) && statusFilterEl
        ? statusFilterEl.value
        : '';

    let currentTasks = getTasksForCurrentFilter();

    if (activeStatus) {
        currentTasks = currentTasks.filter(t => t.status === activeStatus);
    }

    if (normalizedTerm) {
        const queryTokens = splitSearchQuery(normalizedTerm);
        currentTasks = currentTasks.filter(task => {
            return taskMatchesSearch(task, queryTokens, normalizedTerm);
        });
    }

    const containerId = getContainerIdForFilter();

    if (currentTasks.length === 0 && (normalizedTerm || activeStatus)) {
        showNoResultsMessage(containerId, normalizedTerm, activeStatus);
    } else {
        displayTasks(currentTasks, containerId);
    }
}

function showNoResultsMessage(containerId, searchTerm, statusFilter) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const statusLabels = { 'Р': 'Разобрано', 'Н': 'Серия', 'От': 'Отложена', 'П': 'Подсказка' };
    const statusLabel = statusFilter ? (statusLabels[statusFilter] || statusFilter) : '';

    let hint = '';
    if (searchTerm && statusLabel) {
        hint = `По запросу «${escapeHtml(searchTerm)}» в категории «${escapeHtml(statusLabel)}»`;
    } else if (searchTerm) {
        hint = `По запросу «${escapeHtml(searchTerm)}»`;
    } else if (statusLabel) {
        hint = `В категории «${escapeHtml(statusLabel)}»`;
    }

    container.innerHTML = `
        <div class="no-results-message">
            <span class="no-results-icon"><span class="eic eic-search" aria-hidden="true"></span></span>
            <p>Ничего не найдено</p>
            ${hint ? `<p class="no-results-hint">${hint}</p>` : ''}
            <button class="no-results-clear" onclick="clearSearch()">Сбросить фильтр</button>
        </div>
    `;
}

function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const mobileStatusFilter = document.getElementById('mobileStatusFilter');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const mobileSearchClear = document.getElementById('mobileSearchClear');

    if (searchInput) searchInput.value = '';
    if (statusFilterEl) statusFilterEl.value = '';
    if (mobileSearchInput) mobileSearchInput.value = '';
    if (mobileStatusFilter) mobileStatusFilter.value = '';
    if (searchClearBtn) searchClearBtn.classList.remove('visible');
    if (mobileSearchClear) mobileSearchClear.classList.remove('visible');
    if (statusFilterEl) statusFilterEl.classList.remove('has-filter');
    if (mobileStatusFilter) mobileStatusFilter.classList.remove('has-filter');

    searchStatusFilter = 'all';

    displayTasks(getTasksForCurrentFilter(), getContainerIdForFilter());
}

window.clearSearch = clearSearch;

function initMatCenterSearch() {
    const searchInput = document.getElementById('searchInput');
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const mobileSearchClear = document.getElementById('mobileSearchClear');

    let debounceTimer = null;

    function updateClearBtns(value) {
        const hasValue = value.length > 0;
        if (searchClearBtn) searchClearBtn.classList.toggle('visible', hasValue);
        if (mobileSearchClear) mobileSearchClear.classList.toggle('visible', hasValue);
    }

    function handleInput(value, source) {
        if (source === 'sidebar' && mobileSearchInput) mobileSearchInput.value = value;
        if (source === 'mobile' && searchInput) searchInput.value = value;
        updateClearBtns(value);
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runSearch, 150);
    }

    if (searchInput) {
        searchInput.addEventListener('input', () => handleInput(searchInput.value, 'sidebar'));
    }

    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', () => handleInput(mobileSearchInput.value, 'mobile'));
    }

    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', clearSearch);
    }

    if (mobileSearchClear) {
        mobileSearchClear.addEventListener('click', clearSearch);
    }

    // Начальная синхронизация: один инпут может иметь восстановленный браузером текст
    const initialValue = (searchInput && searchInput.value)
        || (mobileSearchInput && mobileSearchInput.value)
        || '';
    if (searchInput) searchInput.value = initialValue;
    if (mobileSearchInput) mobileSearchInput.value = initialValue;
    updateClearBtns(initialValue);
}

