/* Navigation state only. This module never grants access or changes task content. */
let matcenterSelectedSeries = '';
let matcenterReadingMode = false;
let matcenterWorkspaceReady = false;
let matcenterRouteRestoring = false;
let matcenterPendingPlace = null;
let matcenterPlaceFrame = 0;
let matcenterWorkspaceDataSettled = false;
const MATCENTER_PLACE_KEY = 'matcenter_reading_place_v1';

function getSelectedMatcenterSeries() {
    return MatcenterWorkspaceModel.seriesList(allTasks, currentGrade).find(s => s.key === matcenterSelectedSeries) || null;
}

function resetMatcenterWorkspaceSelection() {
    matcenterSelectedSeries = '';
    if (!matcenterRouteRestoring) matcenterPendingPlace = null;
}

function syncMatcenterWorkspace() {
    const select = document.getElementById('mcSeriesSelect');
    if (!select) return;
    const series = MatcenterWorkspaceModel.seriesList(allTasks, currentGrade);
    document.getElementById('mcSeriesRow').hidden = !series.length;
    const options = [{ key: '', label: 'Все задачи раздела' }].concat(series.map(s => ({
        key: s.key, label: [s.title, s.date ? s.date.split('-').reverse().join('.') : '', s.year].filter(Boolean).join(' · ')
    })));
    const signature = JSON.stringify(options);
    if (select.dataset.options !== signature) {
        select.replaceChildren(...options.map(item => new Option(item.label, item.key)));
        select.dataset.options = signature;
    }
    select.value = matcenterSelectedSeries;
    const selected = getSelectedMatcenterSeries();
    const summary = document.getElementById('mcSeriesSummary');
    summary.textContent = selected ? `${selected.tasks.length} ${pluralizeTasks(selected.tasks.length)}` : '';
    updateAllTasksTitleForFilter();
}

function setMatcenterReadingCard(card, open) {
    card.classList.toggle('open', open);
    const toggle = card.querySelector('.task-condition-toggle');
    if (toggle) {
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Скрыть условие' : 'Показать условие';
    }
    if (open) renderLatexInElement(card.querySelector('.task-description'));
}

function setMatcenterReadingMode(value) {
    matcenterReadingMode = value === 'reading';
    document.body.classList.toggle('mc-reading', matcenterReadingMode);
    document.querySelectorAll('[data-mc-view]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.mcView === (matcenterReadingMode ? 'reading' : 'compact')));
    });
    safeSet('matcenter_view', matcenterReadingMode ? 'reading' : 'compact');
    document.querySelectorAll('.task-card[data-task-key]').forEach(card => setMatcenterReadingCard(card, matcenterReadingMode));
    rememberMatcenterRoute(false);
}

function matcenterTaskUrl(task) {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('grade', task.grade);
    url.searchParams.set('task', MatcenterWorkspaceModel.identity(task));
    url.searchParams.set('view', 'reading');
    return url.href;
}

function decorateMatcenterTaskCard(card, task) {
    card.dataset.taskKey = MatcenterWorkspaceModel.identity(task);
    card.tabIndex = -1;
    const info = document.createElement('div');
    info.className = 'mc-task-context';
    const series = MatcenterWorkspaceModel.series(task);
    if (series) card.classList.add('mc-has-series');
    info.textContent = [getGradeTitle(task.grade), series?.title, series?.date?.split('-').reverse().join('.')].filter(Boolean).join(' · ');
    card.querySelector('.task-header').after(info);
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'mc-task-link';
    link.title = 'Скопировать ссылку на задачу';
    link.setAttribute('aria-label', `Скопировать ссылку на задачу ${task.numberText || task.number}`);
    link.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 0-6-6l-2 2" transform="translate(3 2)"/></svg>';
    link.addEventListener('click', async () => {
        const ok = await copySolvedShareText(matcenterTaskUrl(task));
        showPersonalSolvedNotice(ok ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку');
    });
    card.querySelector('.task-header').append(link);
    if (matcenterReadingMode) setMatcenterReadingCard(card, true);
}

function matcenterRouteState() {
    return { grade: currentGrade, filter: currentFilter, series: matcenterSelectedSeries,
        view: matcenterReadingMode ? 'reading' : 'compact', q: document.getElementById('searchInput').value.trim(),
        scope: document.getElementById('mcSearchScope').value, status: document.getElementById('statusFilter').value };
}

function rememberMatcenterRoute(push = true) {
    if (!matcenterWorkspaceReady || matcenterRouteRestoring) return;
    matcenterPendingPlace = null;
    const url = new URL(location.href);
    url.hash = '';
    url.search = '';
    Object.entries(matcenterRouteState()).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
    if (url.href !== location.href) {
        try { history[push ? 'pushState' : 'replaceState'](null, '', url); } catch (_) { /* file:// or private mode */ }
    }
}

function restoreMatcenterRoute(state, place) {
    matcenterRouteRestoring = true;
    try {
        const grade = GRADE_SECTIONS.some(g => g.id === state.grade) ? state.grade : currentGrade;
        setCurrentGrade(grade);
        matcenterSelectedSeries = typeof state.series === 'string' ? state.series.slice(0, 300) : '';
        setMatcenterReadingMode(state.view || safeGet('matcenter_view'));
        document.getElementById('searchInput').value = typeof state.q === 'string' ? state.q.slice(0, 200) : '';
        document.getElementById('mcSearchScope').value = state.scope === 'archive' ? 'archive' : 'section';
        rebuildStatusFilters(currentGrade);
        document.getElementById('statusFilter').value = state.status || '';
        currentFilter = isAllowedFilter(state.filter || '') ? state.filter : 'all-tasks';
        showTaskView(currentFilter.startsWith('topic-') ? 'all-tasks' : currentFilter);
        syncFilterUI();
        matcenterPendingPlace = place || (state.task ? { task: String(state.task).slice(0, 1400), offset: 80, explicit: true } : null);
        refreshCurrentView();
        updateStatistics(getTasksForCurrentGrade());
    } finally { matcenterRouteRestoring = false; }
}

function restoreMatcenterReadingPlace(container) {
    if (!matcenterPendingPlace || matcenterPlaceFrame || !container || container.id !== getContainerIdForFilter() || !allTasks.length) return;
    const pending = matcenterPendingPlace;
    const session = matcenterRenderSessions.get(container);
    if (!session) return;
    const index = session.tasks.findIndex(t => MatcenterWorkspaceModel.identity(t) === pending.task);
    if (index < 0) {
        // A cached snapshot may predate the linked task. Wait for the live load.
        if (!matcenterWorkspaceDataSettled) return;
        matcenterPendingPlace = null;
        if (pending.explicit) showPersonalSolvedNotice('Задача по ссылке не найдена в доступном архиве');
        return;
    }
    matcenterPlaceFrame = requestAnimationFrame(() => {
        matcenterPlaceFrame = 0;
        if (matcenterPendingPlace !== pending || session.cancelled) return;
        if (session.nextIndex <= index) { renderNextMatcenterBatch(session); return; }
        const card = Array.from(container.querySelectorAll('.task-card[data-task-key]')).find(c => c.dataset.taskKey === pending.task);
        if (!card) return;
        if (pending.explicit || pending.open || matcenterReadingMode) setMatcenterReadingCard(card, true);
        requestAnimationFrame(() => {
            if (matcenterPendingPlace !== pending || session.cancelled) return;
            window.scrollTo({ top: Math.max(0, window.scrollY + card.getBoundingClientRect().top - (Number(pending.offset) || 0)), behavior: 'instant' });
            if (pending.explicit) card.focus({ preventScroll: true });
            matcenterPendingPlace = null;
        });
    });
}

function currentMatcenterReadingPlace() {
    const container = document.getElementById(getContainerIdForFilter());
    const card = container && Array.from(container.querySelectorAll('.task-card[data-task-key]')).find(c => c.getBoundingClientRect().bottom > 80);
    return card ? {
        task: card.dataset.taskKey, offset: card.getBoundingClientRect().top, open: card.classList.contains('open')
    } : null;
}

function preserveMatcenterReadingPlaceForRefresh() {
    if (!matcenterPendingPlace && window.scrollY > 0) matcenterPendingPlace = currentMatcenterReadingPlace();
}

function saveMatcenterReadingPlace() {
    if (matcenterPendingPlace || !authToken || !matcenterWorkspaceReady) return;
    const place = currentMatcenterReadingPlace();
    if (place) safeSet(MATCENTER_PLACE_KEY, JSON.stringify({ state: matcenterRouteState(), place }));
}

function initMatcenterWorkspace() {
    matcenterWorkspaceReady = true;
    document.querySelectorAll('[data-mc-view]').forEach(button => button.addEventListener('click', () => setMatcenterReadingMode(button.dataset.mcView)));
    document.getElementById('mcSearchScope').addEventListener('change', () => { rememberMatcenterRoute(false); runSearch(); });
    document.getElementById('mcSeriesSelect').addEventListener('change', event => {
        matcenterSelectedSeries = event.target.value;
        setCurrentFilter('all-tasks');
        updateStatistics(getTasksForCurrentGrade());
    });
    const state = Object.fromEntries(new URLSearchParams(location.search));
    let saved = null;
    try { saved = JSON.parse(safeGet(MATCENTER_PLACE_KEY) || 'null'); } catch (_) {}
    const hasRoute = ['grade', 'filter', 'task', 'q', 'series', 'view'].some(key => key in state);
    // Explicit links take precedence; a plain return restores the last reading position.
    const sameRoute = saved?.state && ['grade', 'filter', 'series', 'view', 'q', 'scope', 'status']
        .every(key => (saved.state[key] || '') === (state[key] || ''));
    const restoreSaved = !state.task && ((!hasRoute && saved?.state?.grade === currentGrade) || sameRoute);
    restoreMatcenterRoute(restoreSaved ? saved.state : hasRoute ? state : { grade: currentGrade, filter: currentFilter }, restoreSaved ? saved.place : null);
    window.addEventListener('popstate', () => restoreMatcenterRoute(Object.fromEntries(new URLSearchParams(location.search))));
    let timer;
    window.addEventListener('scroll', () => { clearTimeout(timer); timer = setTimeout(saveMatcenterReadingPlace, 250); }, { passive: true });
    window.addEventListener('pagehide', saveMatcenterReadingPlace);
}
