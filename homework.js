(function (win) {
    'use strict';
    const core = win.AlmanionPlannerCore, hw = win.AlmanionHomework;
    if (!core || !hw) return;
    const doc = win.document, store = new core.Store();
    const $ = function (id) { return doc.getElementById(id); };
    const esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    const labels = { todo: 'Не начато', doing: 'В работе', done: 'Готово', help: 'Нужна помощь' };
    let state = core.defaultData(), authorized = false, activeUid = '', generation = 0;
    let view = 'now', selected = '', budget = 30, recommendationIndex = 0, opener = null, previousOverflow = '';
    const media = win.matchMedia('(max-width: 760px)');
    function today() { return core.dateKey(new Date()); }
    function dateText(date) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(core.parseDate(date)); }
    function dueText(task) { return task.date === today() ? 'Сегодня' : task.date === core.addDays(today(), 1) ? 'Завтра' : dateText(task.date); }
    function subjectTag(task) { return '<span class="hw-subject" style="--subject-color:' + hw.subject(task.homework.subject).color + '">' + esc(task.homework.subject) + '</span>'; }
    function gate(mode) {
        authorized = false; $('hwApp').hidden = true; $('personalGate').hidden = false;
        closeEditor(); selected = ''; renderDetail();
        $('hwForm').reset(); $('hwId').value = ''; $('hwFormError').textContent = '';
        $('hwSearch').value = ''; $('hwSubjectFilter').innerHTML = '<option value="">Все предметы</option>';
        $('personalGateLogin').hidden = mode === 'checking';
        $('personalGateTitle').textContent = mode === 'checking' ? 'Проверяем аккаунт…' : mode === 'wrong' ? 'Нет доступа' : mode === 'error' ? 'Не удалось открыть задания' : 'Войдите в аккаунт';
        $('personalGateText').textContent = mode === 'error' ? 'Проверьте подключение и повторите вход.' : 'Домашние задания доступны только владельцу.';
        $('personalGateLogin').textContent = mode === 'wrong' ? 'Сменить аккаунт' : 'Войти';
        $('hwList').replaceChildren(); $('hwRecommendation').replaceChildren(); $('hwRecommendation').hidden = true;
    }
    function handleAccount(user) {
        if (user && core.isOwner(user) && activeUid === user.uid) return;
        const request = ++generation;
        activeUid = ''; store.disconnect(); state = core.defaultData();
        if (!user) return gate('guest');
        if (!core.isOwner(user)) return gate('wrong');
        gate('checking'); activeUid = user.uid;
        try { budget = [15, 30, 60].includes(Number(win.localStorage.getItem('almanion:homework:budget:' + activeUid))) ? Number(win.localStorage.getItem('almanion:homework:budget:' + activeUid)) : 30; } catch (_) {}
        const account = win.AlmanionAccount;
        if (!account || !account.database) { activeUid = ''; return gate('error'); }
        store.connect(user, account.database).then(function () {
            if (request !== generation) return;
            authorized = true; $('personalGate').hidden = true; $('hwApp').hidden = false;
            const hash = win.location.hash.slice(1);
            if (hw.isHomework(state.tasks[hash])) selected = hash;
            render();
        }).catch(function () { if (request === generation) { activeUid = ''; gate('error'); } });
    }
    function visibleTasks() { return hw.filter(state.tasks, { view: view, subject: $('hwSubjectFilter').value, query: $('hwSearch').value }); }
    function render() {
        if (!authorized) return;
        $('hwDate').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
        ['now', 'send'].forEach(function (name) { doc.querySelector('[data-count="' + name + '"]').textContent = hw.filter(state.tasks, { view: name }).length; });
        const currentSubject = $('hwSubjectFilter').value;
        const subjects = Array.from(new Set(hw.list(state.tasks).map(function (t) { return t.homework.subject; }))).sort(function (a,b) { return a.localeCompare(b, 'ru'); });
        $('hwSubjectFilter').innerHTML = '<option value="">Все предметы</option>' + subjects.map(function (s) { return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
        $('hwSubjectFilter').value = subjects.includes(currentSubject) ? currentSubject : '';
        const tasks = visibleTasks();
        $('hwListSummary').textContent = tasks.length ? 'Заданий: ' + tasks.length : '';
        if (tasks.length) $('hwList').innerHTML = tasks.map(function (task) {
            const meta = task.homework, status = hw.pendingSubmission(task) ? 'send' : hw.progress(task);
            return '<button type="button" class="hw-row" data-task="' + esc(task.id) + '" aria-pressed="' + (selected === task.id) + '"><span class="hw-row-main">' + subjectTag(task) + '<h3>' + esc(task.title) + '</h3><span class="hw-row-meta"><span>' + esc(dueText(task)) + (task.date < today() && !task.done ? ' · срок прошёл' : '') + '</span><span class="hw-state" data-state="' + status + '">' + (status === 'send' ? 'Отправить' : labels[status]) + '</span>' + (meta.total ? '<span>' + meta.completed + '/' + meta.total + '</span>' : '') + (meta.priority === 'high' ? '<span>Высокий приоритет</span>' : '') + '</span></span><span class="hw-row-arrow" aria-hidden="true">›</span></button>';
        }).join('');
        else {
            const filtered = !!($('hwSearch').value || $('hwSubjectFilter').value);
            const title = filtered ? 'Ничего не найдено' : view === 'send' ? 'Нет работ для отправки' : view === 'archive' ? 'Архив пуст' : view === 'now' && hw.list(state.tasks).length ? 'На сейчас всё' : 'Добавьте первое задание';
            $('hwList').innerHTML = '<div class="hw-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 4H4v17h16V4h-3M8 2h8v5H8zM8 12h8M8 16h5"/></svg><h2>' + title + '</h2><p>' + (filtered ? 'Попробуйте другой запрос или предмет.' : view === 'send' ? 'Здесь будут готовые задания, для которых нужна отправка.' : view === 'archive' ? 'Завершённые задания можно убрать сюда.' : 'Задания, добавленные вручную, появятся и в личном плане.') + '</p>' + (!filtered && view !== 'archive' ? '<button type="button" class="hw-button" data-add>Добавить задание</button>' : '') + '</div>';
        }
        renderRecommendation(tasks); renderDetail();
    }
    function renderRecommendation(tasks) {
        const recs = hw.recommendations(tasks, today(), budget), box = $('hwRecommendation');
        box.hidden = view !== 'now' || !recs.length;
        if (box.hidden) return;
        const rec = recs[recommendationIndex % recs.length];
        box.innerHTML = '<div class="hw-recommendation-top"><span>Можно сейчас</span><label class="hw-budget">Есть<select data-budget aria-label="Время для занятия">' + [15, 30, 60].map(function (n) { return '<option value="' + n + '"' + (n === budget ? ' selected' : '') + '>' + n + ' мин</option>'; }).join('') + '</select></label></div>' + subjectTag(rec.task) + '<h2>' + esc(rec.task.title) + '</h2><p>' + esc(rec.reason) + '</p><div class="hw-recommendation-actions"><button class="hw-primary" type="button" data-task="' + esc(rec.task.id) + '">' + (hw.pendingSubmission(rec.task) ? 'К отправке' : 'Открыть задание') + '</button>' + (recs.length > 1 ? '<button class="hw-button" type="button" data-next-recommendation>Другое</button>' : '') + '</div>';
    }
    function modalDetail(active) {
        const panel = $('hwDetail');
        const open = active && media.matches;
        ['hwTopbar', 'hwHeading', 'personalSyncStatus', 'hwConnection', 'hwTabs', 'hwListPane'].forEach(function (id) { $(id).inert = open; });
        if (open && !panel.hasAttribute('aria-modal')) { previousOverflow = doc.body.style.overflow; doc.body.style.overflow = 'hidden'; }
        if (!open && panel.hasAttribute('aria-modal')) doc.body.style.overflow = previousOverflow;
        if (open) { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'hwDetailTitle'); }
        else { panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); panel.removeAttribute('aria-labelledby'); }
    }
    function renderDetail() {
        const panel = $('hwDetail'), task = authorized && state.tasks[selected];
        if (!hw.isHomework(task)) {
            selected = ''; modalDetail(false); panel.classList.remove('has-selection');
            panel.innerHTML = '<div class="hw-detail-placeholder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 4H5v17h14V4h-3M9 2h6v4H9zM8 11h8M8 15h5"/></svg><p>Выберите задание</p></div>'; return;
        }
        const meta = task.homework, status = hw.progress(task), material = hw.subject(meta.subject);
        panel.classList.add('has-selection');
        panel.innerHTML = '<div class="hw-detail-top"><button type="button" class="hw-icon-button hw-detail-close" data-action="close" aria-label="Вернуться к заданиям">‹</button>' + subjectTag(task) + '<button type="button" class="hw-button" data-action="edit">Изменить</button></div><h2 id="hwDetailTitle">' + esc(task.title) + '</h2><div class="hw-detail-facts"><span>Сдать ' + esc(dateText(task.date)) + '</span>' + (meta.minutes && !task.done ? '<span>Осталось ≈ ' + meta.minutes + ' мин</span>' : '') + (meta.total ? '<span>Решено ' + meta.completed + ' из ' + meta.total + '</span>' : '') + '</div>' + (task.notes ? '<p class="hw-detail-notes">' + esc(task.notes) + '</p>' : '') + '<section class="hw-detail-section"><h3>Выполнение</h3><div class="hw-progress-actions">' + Object.keys(labels).map(function (key) { return '<button type="button" class="hw-button" data-action="progress" data-progress="' + key + '" aria-pressed="' + (key === status) + '">' + labels[key] + '</button>'; }).join('') + '</div></section><section class="hw-detail-section"><h3>Отправка</h3><div class="hw-submission">' + (!meta.requiresSubmission ? '<p>Отправка не требуется</p>' : meta.reportedSubmission ? '<p><strong>Вы отметили отправку</strong>' + (meta.reportedAt ? '<br>' + esc(new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(meta.reportedAt))) : '') + '<br>eSchool пока не подтверждает этот статус.</p><button class="hw-button" type="button" data-action="submission">Снять отметку</button>' : '<p>Отправка не подтверждена. После загрузки работы в eSchool можно отметить её здесь.</p><button class="hw-button" type="button" data-action="submission">Я отправил работу</button>') + '</div></section><div class="hw-detail-links">' + (hw.safeUrl(meta.sourceUrl) ? '<a class="hw-button" target="_blank" rel="noopener noreferrer" href="' + esc(hw.safeUrl(meta.sourceUrl)) + '">Открыть в eSchool ↗</a>' : '') + '<a class="hw-button" href="planner.html?date=' + esc(task.date) + '">В личный план</a>' + (material.href ? '<a class="hw-button" href="' + material.href + '">Конспекты по предмету</a>' : '') + '</div><div class="hw-detail-bottom"><button type="button" class="hw-button" data-action="archive">' + (meta.archived ? 'Вернуть из архива' : 'В архив') + '</button><button type="button" class="hw-button hw-danger" data-action="delete">Удалить задание</button></div>';
        modalDetail(true);
    }
    function selectTask(id) {
        if (!authorized || !hw.isHomework(state.tasks[id])) return;
        selected = id; win.history.replaceState(null, '', '#' + encodeURIComponent(id)); render();
        if (media.matches) $('hwDetail').focus();
    }
    function closeDetail() {
        const id = selected; selected = ''; win.history.replaceState(null, '', win.location.pathname + win.location.search); render();
        const button = Array.from($('hwList').querySelectorAll('[data-task]')).find(function (b) { return b.dataset.task === id; });
        (button || $('hwAdd')).focus();
    }
    function closeEditor() { if ($('hwEditor').open) $('hwEditor').close(); }
    function edit(task) {
        if (!authorized) return;
        opener = doc.activeElement;
        const meta = task && task.homework || {};
        $('hwForm').reset(); $('hwFormError').hidden = true;
        $('hwId').value = task && task.id || ''; $('hwEditorTitle').textContent = task ? 'Изменить задание' : 'Новое задание';
        $('hwSubject').value = meta.subject || $('hwSubjectFilter').value;
        $('hwDue').value = task && task.date || core.addDays(today(), 1);
        $('hwTitle').value = task && task.title || ''; $('hwNotes').value = task && task.notes || '';
        $('hwProgress').value = task ? hw.progress(task) : 'todo'; $('hwMinutes').value = meta.minutes == null ? 30 : meta.minutes;
        $('hwTotal').value = meta.total || 0; $('hwCompleted').value = meta.completed || 0;
        $('hwPriority').value = meta.priority || 'normal'; $('hwRequiresSubmission').checked = meta.requiresSubmission === true;
        $('hwSourceUrl').value = meta.sourceUrl || ''; $('hwEditor').showModal(); $('hwSubject').focus();
    }
    function submit(event) {
        event.preventDefault(); if (!authorized) return;
        try {
            const item = hw.makeTask({ title: $('hwTitle').value, subject: $('hwSubject').value, date: $('hwDue').value, notes: $('hwNotes').value, status: $('hwProgress').value, minutes: $('hwMinutes').value, total: $('hwTotal').value, completed: $('hwCompleted').value, priority: $('hwPriority').value, requiresSubmission: $('hwRequiresSubmission').checked, sourceUrl: $('hwSourceUrl').value }, state.tasks[$('hwId').value]);
            selected = item.id; store.upsert('tasks', item); closeEditor(); render();
            if (media.matches) $('hwDetail').focus();
        } catch (error) { $('hwFormError').textContent = error.message; $('hwFormError').hidden = false; }
    }
    function updateTask(action, button) {
        if (!authorized) return;
        const original = state.tasks[selected]; if (!hw.isHomework(original)) return;
        const task = core.clone(original), meta = task.homework;
        if (action === 'close') return closeDetail();
        if (action === 'edit') return edit(task);
        if (action === 'progress') {
            task.done = button.dataset.progress === 'done';
            meta.phase = ['doing', 'help'].includes(button.dataset.progress) ? button.dataset.progress : 'todo';
            if (task.done && meta.total) meta.completed = meta.total;
        } else if (action === 'submission') { meta.reportedSubmission = !meta.reportedSubmission; meta.reportedAt = meta.reportedSubmission ? Date.now() : 0; }
        else if (action === 'archive') { meta.archived = !meta.archived; }
        else if (action === 'delete') {
            if (win.confirm('Удалить задание и его запись из личного плана?')) { const id = selected; selected = ''; store.remove('tasks', id); render(); $('hwAdd').focus(); } return;
        } else return;
        store.upsert('tasks', task);
        const focus = action === 'progress' ? $('hwDetail').querySelector('[data-progress="' + button.dataset.progress + '"]') : $('hwDetail').querySelector('[data-action="' + action + '"]');
        if (focus) focus.focus();
    }
    function init() {
        $('hwSubjects').innerHTML = hw.SUBJECTS.map(function (s) { return '<option value="' + esc(s.name) + '"></option>'; }).join('');
        $('hwAdd').addEventListener('click', function () { edit(); });
        $('personalGateLogin').addEventListener('click', function () { if (win.AlmanionAccount) win.AlmanionAccount.openLogin(); });
        $('hwForm').addEventListener('submit', submit);
        doc.querySelectorAll('[data-close-editor]').forEach(function (button) { button.addEventListener('click', closeEditor); });
        $('hwEditor').addEventListener('close', function () { if (authorized) (opener && opener.isConnected ? opener : selected && media.matches ? $('hwDetail') : $('hwAdd')).focus(); });
        $('hwTabs').addEventListener('click', function (event) {
            const button = event.target.closest('[data-view]'); if (!button) return;
            view = button.dataset.view; selected = ''; recommendationIndex = 0;
            $('hwTabs').querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); }); render();
        });
        $('hwSearch').addEventListener('input', function () { recommendationIndex = 0; render(); });
        $('hwSubjectFilter').addEventListener('change', function () { recommendationIndex = 0; render(); });
        $('hwListPane').addEventListener('click', function (event) {
            const button = event.target.closest('button'); if (!button) return;
            if (button.hasAttribute('data-task')) selectTask(button.dataset.task);
            else if (button.hasAttribute('data-add')) edit();
            else if (button.hasAttribute('data-next-recommendation')) { recommendationIndex++; renderRecommendation(visibleTasks()); }
        });
        $('hwListPane').addEventListener('change', function (event) {
            if (!event.target.matches('[data-budget]')) return;
            budget = Number(event.target.value); recommendationIndex = 0;
            try { win.localStorage.setItem('almanion:homework:budget:' + activeUid, String(budget)); } catch (_) {}
            renderRecommendation(visibleTasks());
        });
        $('hwDetail').addEventListener('click', function (event) { const button = event.target.closest('[data-action]'); if (button) updateTask(button.dataset.action, button); });
        $('hwConnectionInfo').addEventListener('click', function () { const hidden = !$('hwConnectionText').hidden; $('hwConnectionText').hidden = hidden; $('hwConnectionInfo').setAttribute('aria-expanded', String(!hidden)); });
        doc.addEventListener('keydown', function (event) {
            if ($('hwEditor').open || !selected || !media.matches) return;
            if (event.key === 'Escape') { event.preventDefault(); closeDetail(); }
            if (event.key === 'Tab') {
                const nodes = Array.from($('hwDetail').querySelectorAll('button,a[href]')).filter(function (node) { return node.getClientRects().length; });
                const first = nodes[0], last = nodes[nodes.length - 1];
                if (event.shiftKey && (doc.activeElement === first || doc.activeElement === $('hwDetail'))) { event.preventDefault(); last.focus(); }
                else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
        media.addEventListener('change', function () { modalDetail(!!selected); });
        doc.addEventListener('visibilitychange', function () { if (!doc.hidden && authorized) render(); });
        core.mountSyncStatus(store, $('personalSyncStatus'));
        store.subscribe(function (snapshot) { state = snapshot; if (authorized) render(); });
        const account = win.AlmanionAccount;
        if (account && account.auth && typeof account.auth.onAuthStateChanged === 'function') account.auth.onAuthStateChanged(handleAccount);
        else gate('guest');
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true }); else init();
}(window));
