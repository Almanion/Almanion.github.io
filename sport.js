(function (win) {
    'use strict';

    const core = win.AlmanionPlannerCore;
    if (!core) return;

    const PROGRAM = {
        A: {
            title: 'A · всё тело', duration: '45–55 мин', day: 'Понедельник', cardio: '8–10 минут энергичного шага без прыжков',
            exercises: [
                { name: 'Подтягивания', start: '2×1–2', main: '2×1–4', rest: '2 мин', note: 'Минимум 2 повтора в запасе; без маха.' },
                { name: 'Присед с гантелью у груди', start: '2×8–10', main: '3×8–12', rest: '90–120 с', note: 'Пятки на полу, контролируемая глубина.' },
                { name: 'Жим гантелей лёжа', start: '2×8–10', main: '3×8–12', rest: '90–120 с', note: 'Скамья или пол; при небезопасном весе — отжимания.' },
                { name: 'Тяга одной гантели с опорой', start: '2×10–12/сторона', main: '2×10–15/сторона', rest: '60–90 с', note: '15–30 с между сторонами, корпус не разворачивать.' },
                { name: 'Молоток', start: '1×10–12', main: '2×10–15', rest: '60 с', note: 'Первым убрать при нехватке времени.' },
                { name: 'Мёртвый жук', start: '1×6/сторона', main: '2×6–10/сторона', rest: '45–60 с', note: 'Не увеличивать прогиб поясницы.' }
            ]
        },
        B: {
            title: 'B · верх + лёгкие ноги', duration: '40–50 мин', day: 'Среда', cardio: '5–8 минут спокойного шага',
            exercises: [
                { name: 'Жим гантелей на наклонной скамье', start: '2×8–10', main: '3×8–12', rest: '90–120 с', note: 'Наклон 15–30°; при неустойчивой скамье — жим на полу.' },
                { name: 'Тяга одной гантели с опорой', start: '2×10–12/сторона', main: '3×10–15/сторона', rest: '60–90 с', note: 'Одинаковая чистая техника с обеих сторон.' },
                { name: 'Ягодичный мост', start: '2×12', main: '2×12–20', rest: '60 с', note: 'Пауза сверху 1 с; дополнительный вес необязателен.' },
                { name: 'Подъём гантелей через стороны', start: '1×12', main: '2×12–15', rest: '60 с', note: 'Только лёгкий вес, без раскачивания.' },
                { name: 'Птица-собака', start: '1×6/сторона', main: '2×6–8/сторона', rest: '45–60 с', note: 'Удержание 2–3 с.' }
            ]
        },
        C: {
            title: 'C · всё тело', duration: '45–55 мин', day: 'Суббота', cardio: '8–10 минут спокойной непрерывной работы',
            exercises: [
                { name: 'Подтягивания', start: '2×1–2', main: '3×1–4', rest: '2 мин', note: 'Если нет запаса — заменить тягой, не добавлять её сверху.' },
                { name: 'Раздельный присед', start: '2×8/сторона', main: '3×8–12/сторона', rest: '90 с', note: 'Обе стопы на полу; начать без веса.' },
                { name: 'Наклон с гантелями / RDL', start: '2×8', main: '2×8–12', rest: '90–120 с', note: 'В неделю 1 — один лёгкий подход; всегда RIR ≥3.' },
                { name: 'Отжимания', start: '2×8–10', main: '3×8–15', rest: '90 с', note: 'При лёгких 15 повторах опускаться около 3 секунд.' },
                { name: 'Боковая планка', start: '1×15–20 с/сторона', main: '2×20–35 с/сторона', rest: '45–60 с', note: 'Закончить до потери положения.' }
            ]
        },
        D: {
            title: 'D · аэробная', duration: '20–35 мин', day: 'Вторник, необязательно', cardio: 'Разговорный темп, без прыжков и утяжелителей',
            exercises: [
                { name: 'Энергичный шаг и приставные шаги', start: '20–25 мин', main: '25–35 мин', rest: 'непрерывно', note: 'Чередовать движения каждые 1–2 минуты; допустима быстрая прогулка.' }
            ]
        }
    };
    const WEEK_INFO = {
        1: { mode: 'Стартовый объём', rir: 'RIR 4–5', note: 'Освоение техники; новый RDL — один лёгкий подход.' },
        2: { mode: 'Стартовый объём', rir: 'RIR 3–4', note: 'Закрепить технику без форсирования нагрузки.' },
        3: { mode: 'Основной объём', rir: 'RIR 2–3', note: 'Добавить плановые подходы, но не вес одновременно.' },
        4: { mode: 'Основной объём', rir: 'RIR 2–3', note: 'Сначала повышать повторы, затем вес.' },
        5: { mode: 'Разгрузка', rir: 'RIR около 4', note: '3 подхода → 2, 2 → 1; вес не повышать.' },
        6: { mode: 'Основной объём', rir: 'RIR 2–3', note: 'Вернуть комфортные веса конца недели 4.' },
        7: { mode: 'Плавный прогресс', rir: 'RIR 2–3', note: 'Прогрессировать без отказа.' },
        8: { mode: 'Закрепление', rir: 'RIR 2–3', note: 'Сравнить записи без максимальных тестов.' }
    };
    const DAY_PLAN = [
        { day: 'Пн', full: 'Понедельник', session: 'A', detail: 'Всё тело' },
        { day: 'Вт', full: 'Вторник', session: 'D', detail: 'Необязательно с недели 3' },
        { day: 'Ср', full: 'Среда', session: 'B', detail: 'Верх + лёгкие ноги' },
        { day: 'Чт', full: 'Четверг', session: 'ФК', detail: '08:15 · 2 часа' },
        { day: 'Пт', full: 'Пятница', session: 'Восстановление', detail: 'Обычная ходьба' },
        { day: 'Сб', full: 'Суббота', session: 'C', detail: 'Всё тело' },
        { day: 'Вс', full: 'Воскресенье', session: 'Отдых', detail: 'Прогулка, без компенсации' }
    ];

    const store = new core.Store();
    const doc = win.document;
    const refs = {};
    let state = core.defaultData();
    let authorized = false;
    let activeUid = '';
    let view = 'today';
    let activeSession = 'A';

    function byId(id) { return doc.getElementById(id); }
    function esc(value) { const node = doc.createElement('div'); node.textContent = value == null ? '' : String(value); return node.innerHTML; }
    function num(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : (fallback || 0); }
    function values(value) { return Object.values(core.objectMap(value)); }
    function toast(message, type) { if (win.AlmanionToast) win.AlmanionToast.show(message, { type: type || 'info' }); }
    function today() { return core.dateKey(new Date()); }
    function programWeek() { return Math.max(1, Math.min(8, num(state.settings.currentProgramWeek, 1))); }
    function currentMonday() { return core.startOfWeek(today()); }
    function dateForDay(dayIndex) { return core.addDays(currentMonday(), dayIndex); }
    function displayDate(value) { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(core.parseDate(value)); }
    function weekdayIndex() { return (new Date().getDay() + 6) % 7; }
    function prescription(exercise, week) {
        if (week === 5) {
            const main = String(exercise.main);
            if (/^3×/.test(main)) return main.replace(/^3×/, '2×');
            if (/^2×/.test(main)) return main.replace(/^2×/, '1×');
            return main;
        }
        return week <= 2 ? exercise.start : exercise.main;
    }
    function plannedSets(text) { const match = String(text || '').match(/^(\d+)×/); return match ? Number(match[1]) : 1; }

    function cacheRefs() {
        ['personalGate','personalGateTitle','personalGateText','personalGateLogin','sportApp','sportHeroStatus','sportWeekSelect','sportStartWorkout','sportStats','sportTabs','sportContent','sportWorkoutModal','sportWorkoutForm','sportWorkoutId','sportWorkoutKicker','sportWorkoutTitle','sportSessionPicker','sportWorkoutDate','sportWorkoutSleep','sportWorkoutBefore','sportWorkoutAfter','sportExerciseLog','sportWorkoutCardio','sportWorkoutTalkPace','sportWorkoutNotes','sportWorkoutError','sportSkipWorkout','sportMetricModal','sportMetricForm','sportMetricId','sportMetricDate','sportMetricWeight','sportMetricSteps','sportMetricWalkMinutes','sportMetricDistance','sportMetricFeeling','sportMetricNotes','sportDeleteMetric'].forEach(function (id) { refs[id] = byId(id); });
    }

    function showGate(mode) {
        authorized = false;
        refs.sportApp.hidden = true;
        refs.personalGate.hidden = false;
        refs.personalGateLogin.hidden = mode === 'checking';
        if (mode === 'checking') { refs.personalGateTitle.textContent = 'Проверяем аккаунт…'; refs.personalGateText.textContent = 'Дневник доступен только владельцу.'; }
        else if (mode === 'wrong') { refs.personalGateTitle.textContent = 'Нет доступа'; refs.personalGateText.textContent = 'Этот аккаунт не может открыть спортивный дневник.'; refs.personalGateLogin.textContent = 'Сменить аккаунт'; }
        else { refs.personalGateTitle.textContent = 'Войдите в аккаунт'; refs.personalGateText.textContent = 'Для открытия спортивного дневника требуется вход.'; refs.personalGateLogin.textContent = 'Войти'; }
    }

    function seedProgram() {
        if (Object.keys(core.objectMap(state.sport.program)).length) return;
        store.setPath('sport/program', PROGRAM);
        const start = new Date().getFullYear() + '-01-01';
        const seeds = [
            { id: 'system-sport-a', title: 'Тренировка A', day: 1, category: 'sport' },
            { id: 'system-sport-b', title: 'Тренировка B', day: 3, category: 'sport' },
            { id: 'system-sport-c', title: 'Тренировка C', day: 6, category: 'sport' },
            { id: 'system-physical-education', title: 'Физкультура', day: 4, category: 'school', startTime: '08:15', endTime: '10:15' }
        ];
        seeds.forEach(function (item) {
            if (state.events[item.id]) return;
            store.upsert('events', {
                id: item.id, title: item.title, category: item.category, date: start,
                startTime: item.startTime || '', endTime: item.endTime || '', allDay: !item.startTime,
                recurrence: { frequency: 'weekly', interval: 1, days: [item.day] }, reminderMinutes: [720], notes: '', system: true
            });
        });
    }

    function showApp() {
        authorized = true;
        refs.personalGate.hidden = true;
        refs.sportApp.hidden = false;
        seedProgram();
        render();
    }

    function handleAccount(user) {
        if (!user) { activeUid = ''; store.disconnect(); showGate('guest'); return; }
        if (!core.isOwner(user)) { activeUid = ''; store.disconnect(); showGate('wrong'); return; }
        if (activeUid === user.uid && authorized) return;
        activeUid = user.uid;
        showGate('checking');
        const database = win.AlmanionAccount && win.AlmanionAccount.database;
        if (!database) { refs.personalGateTitle.textContent = 'Не удалось открыть дневник'; refs.personalGateText.textContent = 'Firebase недоступен. Обновите страницу.'; return; }
        store.connect(user, database).then(showApp).catch(function () { refs.personalGateTitle.textContent = 'Не удалось открыть дневник'; refs.personalGateText.textContent = 'Проверьте подключение и правила доступа Firebase.'; });
    }

    function recentWorkouts() { return values(state.sport.workouts).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || num(b.updatedAt) - num(a.updatedAt); }); }
    function recentMetrics() { return values(state.sport.measurements).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }); }
    function workoutsThisWeek() {
        const start = currentMonday();
        const end = core.addDays(start, 6);
        return recentWorkouts().filter(function (item) { return item.date >= start && item.date <= end; });
    }

    function statsMarkup() {
        const weekLogs = workoutsThisWeek();
        const completed = weekLogs.filter(function (item) { return item.status === 'completed'; }).length;
        const skipped = weekLogs.filter(function (item) { return item.status === 'skipped'; }).length;
        const latestMetric = recentMetrics()[0];
        const cardio = weekLogs.reduce(function (total, item) { return total + num(item.cardioMinutes); }, 0);
        return [
            [completed + '/3', 'силовых за неделю'],
            [String(cardio), 'аэробных минут'],
            [latestMetric && latestMetric.weight ? latestMetric.weight + ' кг' : '—', 'последний вес'],
            [String(skipped), 'пропусков']
        ].map(function (item) { return '<article class="sport-stat"><strong>' + esc(item[0]) + '</strong><span>' + esc(item[1]) + '</span></article>'; }).join('');
    }

    function weekPlanMarkup() {
        const index = weekdayIndex();
        return '<div class="sport-week-plan">' + DAY_PLAN.map(function (item, itemIndex) {
            const session = PROGRAM[item.session];
            const disabledD = item.session === 'D' && programWeek() < 3;
            return '<article class="sport-day' + (itemIndex === index ? ' is-today' : '') + '"><span>' + item.day + ' · ' + displayDate(dateForDay(itemIndex)) + '</span><strong>' + esc(disabledD ? 'Без D' : item.session) + '</strong><p>' + esc(disabledD ? 'Аэробная D начнётся с недели 3' : item.detail) + '</p>' + (session && !disabledD ? '<button type="button" data-start-session="' + item.session + '" data-session-date="' + dateForDay(itemIndex) + '">Открыть</button>' : '') + '</article>';
        }).join('') + '</div>';
    }

    function nextSession() {
        const index = weekdayIndex();
        for (let offset = 0; offset < 8; offset++) {
            const entry = DAY_PLAN[(index + offset) % 7];
            if (PROGRAM[entry.session] && !(entry.session === 'D' && programWeek() < 3)) return { entry: entry, offset: offset, date: core.addDays(today(), offset) };
        }
        return { entry: DAY_PLAN[0], offset: 0, date: today() };
    }

    function renderToday() {
        const next = nextSession();
        const week = WEEK_INFO[programWeek()];
        return '<section class="sport-section"><div class="sport-section-heading"><h2>Эта неделя</h2><span>' + esc(week.mode + ' · ' + week.rir) + '</span></div>' + weekPlanMarkup() + '</section>' +
            '<section class="sport-section"><div class="sport-section-heading"><h2>Следующая тренировка</h2></div><article class="sport-next-card"><span class="sport-next-badge">' + esc(next.entry.session) + '</span><div><h3>' + esc(PROGRAM[next.entry.session].title) + '</h3><p>' + esc((next.offset ? displayDate(next.date) : 'Сегодня') + ' · ' + PROGRAM[next.entry.session].duration + ' · ' + week.rir) + '</p></div><button type="button" data-start-session="' + next.entry.session + '" data-session-date="' + next.date + '">Начать</button></article></section>' +
            '<section class="sport-section"><div class="sport-section-heading"><h2>Правило недели</h2></div><p style="margin:0;color:var(--text-secondary);line-height:1.55">' + esc(week.note) + '</p></section>';
    }

    function programCard(key) {
        const session = PROGRAM[key];
        return '<article class="sport-program-card"><header><h3>' + esc(session.title) + '</h3><span>' + esc(session.day + ' · ' + session.duration) + '</span></header><div class="sport-exercise-list">' + session.exercises.map(function (exercise) {
            return '<div class="sport-exercise-row"><div><strong>' + esc(exercise.name) + '</strong><p>' + esc(exercise.note + ' Отдых: ' + exercise.rest) + '</p></div><span>' + esc(prescription(exercise, programWeek())) + '</span></div>';
        }).join('') + '</div></article>';
    }

    function renderProgram() {
        const week = WEEK_INFO[programWeek()];
        return '<section class="sport-section"><div class="sport-section-heading"><h2>Неделя ' + programWeek() + '</h2><span>' + esc(week.mode + ' · ' + week.rir) + '</span></div><p style="margin:0 0 1rem;color:var(--text-secondary);line-height:1.55">' + esc(week.note) + '</p><div class="sport-program-grid">' + ['A','B','C','D'].map(programCard).join('') + '</div></section>' +
            '<section class="sport-section"><div class="sport-section-heading"><h2>Как прогрессировать</h2></div><div class="sport-program-grid"><article class="sport-program-card"><div class="sport-exercise-list"><div class="sport-exercise-row"><div><strong>Сначала повторы</strong><p>Дойдите до верхней границы во всех подходах с нужным запасом.</p></div></div><div class="sport-exercise-row"><div><strong>Затем вес</strong><p>После двух уверенных занятий добавьте минимальный доступный вес, ориентир — не более 5–10%.</p></div></div></div></article><article class="sport-program-card"><div class="sport-exercise-list"><div class="sport-exercise-row"><div><strong>Без компенсации</strong><p>После пропуска продолжайте A → B → C и не объединяйте занятия.</p></div></div><div class="sport-exercise-row"><div><strong>Восстановление важнее D</strong><p>При усталости сначала убрать необязательную аэробную тренировку.</p></div></div></div></article></div></section>';
    }

    function renderHistory() {
        const items = recentWorkouts();
        return '<section class="sport-section"><div class="sport-section-heading"><h2>История тренировок</h2><button type="button" data-start-session="A" data-session-date="' + today() + '">+ Запись</button></div><div class="sport-history">' + (items.length ? items.map(function (item) {
            const date = core.parseDate(item.date);
            const sets = (item.exercises || []).reduce(function (total, exercise) { return total + (exercise.sets || []).filter(function (set) { return set.reps || set.weight; }).length; }, 0);
            return '<article class="sport-history-item"><span class="sport-history-date"><strong>' + date.getDate() + '</strong>' + esc(new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(date)) + '</span><div><h3>' + esc((item.session || '—') + ' · ' + (PROGRAM[item.session] && PROGRAM[item.session].title.replace(/^. · /,'') || 'Тренировка')) + '</h3><p>' + esc((item.status === 'skipped' ? 'Пропуск' : sets + ' рабочих подходов') + (item.cardioMinutes ? ' · ' + item.cardioMinutes + ' мин аэробной' : '')) + '</p></div><div class="sport-history-actions"><span class="sport-history-status' + (item.status === 'skipped' ? ' is-skipped' : '') + '">' + (item.status === 'skipped' ? 'Пропущено' : 'Выполнено') + '</span><button type="button" data-edit-workout="' + esc(item.id) + '">Изменить</button></div></article>';
        }).join('') : '<div class="planner-empty"><div><strong>Записей пока нет</strong><span>Начните тренировку, чтобы сохранить первый результат.</span></div></div>') + '</div></section>';
    }

    function renderMetrics() {
        const items = recentMetrics().slice(0, 14).reverse();
        const weights = items.map(function (item) { return num(item.weight); }).filter(Boolean);
        const min = weights.length ? Math.min.apply(null, weights) : 0;
        const max = weights.length ? Math.max.apply(null, weights) : 1;
        const bars = items.filter(function (item) { return item.weight; }).map(function (item) {
            const height = max === min ? 65 : 25 + (num(item.weight) - min) / (max - min) * 70;
            return '<div class="sport-chart-column" title="' + esc(item.weight + ' кг · ' + item.date) + '"><span class="sport-chart-bar" style="height:' + height + '%"></span><small>' + esc(displayDate(item.date)) + '</small></div>';
        }).join('');
        return '<div class="sport-metrics-layout"><section class="sport-metric-chart"><div class="sport-section-heading"><h2>Масса тела</h2><button type="button" data-add-metric>+ Записать</button></div><div class="sport-chart-bars">' + (bars || '<div class="planner-empty"><div><strong>Нет измерений</strong><span>Добавьте первое значение.</span></div></div>') + '</div></section><aside><section class="sport-section" style="margin-top:0"><div class="sport-section-heading"><h2>Последние записи</h2></div><div class="sport-metric-list">' + (recentMetrics().slice(0,8).map(function (item) { return '<article class="sport-metric-row"><div><strong>' + esc(displayDate(item.date) + (item.weight ? ' · ' + item.weight + ' кг' : '')) + '</strong><span>' + esc([item.steps ? item.steps + ' шагов' : '', item.walkMinutes ? item.walkMinutes + ' мин прогулки' : '', item.feeling ? 'самочувствие ' + item.feeling + '/5' : ''].filter(Boolean).join(' · ') || item.notes || 'Запись дня') + '</span></div><button type="button" data-edit-metric="' + esc(item.id) + '">Изменить</button></article>'; }).join('') || '<div class="planner-empty"><span>Пока пусто</span></div>') + '</div></section></aside></div>';
    }

    function renderExport() {
        return '<section class="sport-section"><div class="sport-section-heading"><h2>Экспорт данных</h2></div><div class="sport-export-grid"><article class="sport-export-card"><h3>JSON</h3><p>Полный структурированный архив для восстановления или глубокого анализа.</p><button type="button" data-export-sport="json">Скачать JSON</button></article><article class="sport-export-card"><h3>CSV</h3><p>Подходы, веса, повторения и показатели для таблиц и графиков.</p><button type="button" data-export-sport="csv">Скачать CSV</button></article><article class="sport-export-card"><h3>Для нейросети</h3><p>Понятная сводка Markdown без данных почты и других разделов сайта.</p><button type="button" data-export-sport="markdown">Скачать Markdown</button></article></div></section>';
    }

    function render() {
        if (!authorized) return;
        const week = programWeek();
        refs.sportWeekSelect.value = String(week);
        refs.sportHeroStatus.textContent = 'Неделя ' + week + ' из 8 · ' + WEEK_INFO[week].mode;
        refs.sportStats.innerHTML = statsMarkup();
        refs.sportTabs.querySelectorAll('[data-sport-view]').forEach(function (button) { button.classList.toggle('is-active', button.dataset.sportView === view); });
        if (view === 'today') refs.sportContent.innerHTML = renderToday();
        else if (view === 'program') refs.sportContent.innerHTML = renderProgram();
        else if (view === 'history') refs.sportContent.innerHTML = renderHistory();
        else if (view === 'metrics') refs.sportContent.innerHTML = renderMetrics();
        else refs.sportContent.innerHTML = renderExport();
    }

    function closeModal(layer) { if (!layer) return; layer.hidden = true; layer.setAttribute('aria-hidden','true'); doc.body.style.overflow = ''; }
    function openModal(layer) { layer.hidden = false; layer.setAttribute('aria-hidden','false'); doc.body.style.overflow = 'hidden'; }
    function latestExercise(session, exerciseName) {
        const workout = recentWorkouts().find(function (item) { return item.status === 'completed' && item.session === session && (item.exercises || []).some(function (exercise) { return exercise.name === exerciseName; }); });
        return workout && workout.exercises.find(function (exercise) { return exercise.name === exerciseName; });
    }

    function sessionPickerMarkup(selected) {
        return ['A','B','C','D'].map(function (key) { return '<label><input type="radio" name="sportSession" value="' + key + '"' + (key === selected ? ' checked' : '') + '><span>' + esc(PROGRAM[key].title) + '</span></label>'; }).join('');
    }

    function exerciseLogMarkup(sessionKey, editedWorkout) {
        const session = PROGRAM[sessionKey];
        const week = programWeek();
        return session.exercises.map(function (exercise, exerciseIndex) {
            const plan = prescription(exercise, week);
            const count = plannedSets(plan);
            const edited = editedWorkout && (editedWorkout.exercises || []).find(function (item) { return item.name === exercise.name; });
            const previous = edited || latestExercise(sessionKey, exercise.name);
            let rows = '<span>№</span><span>Повторы</span><span>Вес, кг</span><span>RIR</span>';
            for (let setIndex = 0; setIndex < count; setIndex++) {
                const previousSet = previous && previous.sets && previous.sets[setIndex] || {};
                rows += '<span>' + (setIndex + 1) + '</span><input data-set-reps type="text" inputmode="numeric" maxlength="16" value="' + esc(previousSet.reps || '') + '" aria-label="Повторы, подход ' + (setIndex + 1) + '"><input data-set-weight type="number" min="0" max="300" step="0.25" inputmode="decimal" value="' + esc(previousSet.weight || '') + '" aria-label="Вес, подход ' + (setIndex + 1) + '"><input data-set-rir type="number" min="0" max="10" step="1" inputmode="numeric" value="' + esc(previousSet.rir || '') + '" aria-label="RIR, подход ' + (setIndex + 1) + '">';
            }
            return '<article class="sport-log-row" data-exercise-index="' + exerciseIndex + '"><header><div><h3>' + esc(exercise.name) + '</h3><span>' + esc(exercise.note) + '</span></div><span>' + esc(plan + ' · ' + exercise.rest) + '</span></header><div class="sport-set-grid">' + rows + '</div></article>';
        }).join('');
    }

    function openWorkout(session, date, id) {
        const existing = id && state.sport.workouts[id];
        activeSession = PROGRAM[existing && existing.session || session] ? (existing && existing.session || session) : 'A';
        refs.sportWorkoutForm.reset();
        refs.sportWorkoutId.value = existing && existing.id || '';
        refs.sportWorkoutDate.value = existing && existing.date || date || today();
        refs.sportWorkoutSleep.value = existing && existing.sleepHours !== '' ? existing.sleepHours : '';
        refs.sportWorkoutBefore.value = existing && existing.feelingBefore !== '' ? existing.feelingBefore : '';
        refs.sportWorkoutAfter.value = existing && existing.feelingAfter !== '' ? existing.feelingAfter : '';
        refs.sportWorkoutCardio.value = existing && existing.cardioMinutes || '';
        refs.sportWorkoutTalkPace.checked = !!(existing && existing.talkPace);
        refs.sportWorkoutNotes.value = existing && existing.notes || '';
        refs.sportWorkoutKicker.textContent = 'Неделя ' + programWeek() + ' · ' + WEEK_INFO[programWeek()].rir;
        refs.sportWorkoutTitle.textContent = PROGRAM[activeSession].title;
        refs.sportSessionPicker.innerHTML = sessionPickerMarkup(activeSession);
        refs.sportExerciseLog.innerHTML = exerciseLogMarkup(activeSession, existing);
        refs.sportSkipWorkout.textContent = existing ? 'Удалить запись' : 'Отметить пропуск';
        refs.sportWorkoutError.hidden = true;
        openModal(refs.sportWorkoutModal);
    }

    function changeWorkoutSession(session) {
        if (!PROGRAM[session]) return;
        activeSession = session;
        refs.sportWorkoutTitle.textContent = PROGRAM[session].title;
        refs.sportExerciseLog.innerHTML = exerciseLogMarkup(session);
    }

    function collectExercises() {
        return Array.from(refs.sportExerciseLog.querySelectorAll('.sport-log-row')).map(function (row, exerciseIndex) {
            const exercise = PROGRAM[activeSession].exercises[exerciseIndex];
            const reps = row.querySelectorAll('[data-set-reps]');
            const weights = row.querySelectorAll('[data-set-weight]');
            const rirs = row.querySelectorAll('[data-set-rir]');
            return { name: exercise.name, plan: prescription(exercise, programWeek()), sets: Array.from(reps).map(function (field, index) { return { reps: field.value.trim(), weight: weights[index].value ? Number(weights[index].value) : '', rir: rirs[index].value ? Number(rirs[index].value) : '' }; }) };
        });
    }

    function saveWorkout(event, status) {
        if (event) event.preventDefault();
        const date = refs.sportWorkoutDate.value || today();
        const id = refs.sportWorkoutId.value || core.safeId('workout');
        const workout = {
            id: id, date: date, session: activeSession, programWeek: programWeek(), status: status || 'completed',
            sleepHours: refs.sportWorkoutSleep.value ? Number(refs.sportWorkoutSleep.value) : '',
            feelingBefore: refs.sportWorkoutBefore.value ? Number(refs.sportWorkoutBefore.value) : '',
            feelingAfter: refs.sportWorkoutAfter.value ? Number(refs.sportWorkoutAfter.value) : '',
            exercises: status === 'skipped' ? [] : collectExercises(),
            cardioMinutes: refs.sportWorkoutCardio.value ? Number(refs.sportWorkoutCardio.value) : 0,
            talkPace: refs.sportWorkoutTalkPace.checked,
            notes: refs.sportWorkoutNotes.value.trim(),
            completedAt: Date.now()
        };
        store.upsertSport('workouts', workout);
        closeModal(refs.sportWorkoutModal);
        view = 'history';
        toast(status === 'skipped' ? 'Пропуск отмечен' : 'Тренировка сохранена', 'success');
    }

    function openMetric(id) {
        const existing = id && state.sport.measurements[id];
        refs.sportMetricForm.reset();
        refs.sportMetricId.value = existing && existing.id || '';
        refs.sportMetricDate.value = existing && existing.date || today();
        refs.sportMetricWeight.value = existing && existing.weight !== '' ? existing.weight : '';
        refs.sportMetricSteps.value = existing && existing.steps !== '' ? existing.steps : '';
        refs.sportMetricWalkMinutes.value = existing && existing.walkMinutes !== '' ? existing.walkMinutes : '';
        refs.sportMetricDistance.value = existing && existing.distance !== '' ? existing.distance : '';
        refs.sportMetricFeeling.value = existing && existing.feeling !== '' ? existing.feeling : '';
        refs.sportMetricNotes.value = existing && existing.notes || '';
        refs.sportDeleteMetric.hidden = !existing;
        openModal(refs.sportMetricModal);
    }
    function saveMetric(event) {
        event.preventDefault();
        const date = refs.sportMetricDate.value || today();
        const existing = refs.sportMetricId.value && state.sport.measurements[refs.sportMetricId.value]
            || values(state.sport.measurements).find(function (item) { return item.date === date; });
        store.upsertSport('measurements', {
            id: existing && existing.id || core.safeId('metric'), date: date,
            weight: refs.sportMetricWeight.value ? Number(refs.sportMetricWeight.value) : '',
            steps: refs.sportMetricSteps.value ? Number(refs.sportMetricSteps.value) : '',
            walkMinutes: refs.sportMetricWalkMinutes.value ? Number(refs.sportMetricWalkMinutes.value) : '',
            distance: refs.sportMetricDistance.value ? Number(refs.sportMetricDistance.value) : '',
            feeling: refs.sportMetricFeeling.value ? Number(refs.sportMetricFeeling.value) : '',
            notes: refs.sportMetricNotes.value.trim()
        });
        closeModal(refs.sportMetricModal);
        toast('Показатели сохранены', 'success');
    }

    function deleteMetric() {
        const id = refs.sportMetricId.value;
        if (!id || !win.confirm('Удалить эту запись показателей?')) return;
        store.removeSport('measurements', id);
        closeModal(refs.sportMetricModal);
        toast('Запись удалена', 'success');
    }

    function skipOrDeleteWorkout() {
        const id = refs.sportWorkoutId.value;
        if (id) {
            if (!win.confirm('Удалить эту запись тренировки?')) return;
            store.removeSport('workouts', id);
            closeModal(refs.sportWorkoutModal);
            view = 'history';
            toast('Запись удалена', 'success');
            return;
        }
        saveWorkout(null, 'skipped');
    }

    function csvEscape(value) { const text = String(value == null ? '' : value); return /[;"\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text; }
    function exportSport(format) {
        const payload = { schema: 1, exportedAt: new Date().toISOString(), programWeek: programWeek(), program: PROGRAM, workouts: recentWorkouts(), measurements: recentMetrics() };
        if (format === 'json') return core.download('almanion-sport.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
        if (format === 'csv') {
            const rows = [['date','session','status','week','exercise','set','reps','weight_kg','rir','sleep_hours','feeling_before','feeling_after','cardio_minutes','notes']];
            payload.workouts.forEach(function (workout) {
                if (!workout.exercises || !workout.exercises.length) rows.push([workout.date,workout.session,workout.status,workout.programWeek,'','','','','',workout.sleepHours,workout.feelingBefore,workout.feelingAfter,workout.cardioMinutes,workout.notes]);
                (workout.exercises || []).forEach(function (exercise) { (exercise.sets || []).forEach(function (set,index) { rows.push([workout.date,workout.session,workout.status,workout.programWeek,exercise.name,index+1,set.reps,set.weight,set.rir,workout.sleepHours,workout.feelingBefore,workout.feelingAfter,workout.cardioMinutes,workout.notes]); }); });
            });
            return core.download('almanion-sport.csv', '\ufeff' + rows.map(function (row) { return row.map(csvEscape).join(';'); }).join('\n'), 'text/csv;charset=utf-8');
        }
        let markdown = '# Спортивный дневник Almanion\n\nЭкспорт: ' + new Date().toLocaleString('ru-RU') + '\n\n## Текущий цикл\n\nНеделя ' + programWeek() + ' из 8 — ' + WEEK_INFO[programWeek()].mode + ', ' + WEEK_INFO[programWeek()].rir + '.\n\n## Тренировки\n';
        payload.workouts.forEach(function (workout) { markdown += '\n### ' + workout.date + ' · ' + workout.session + ' · ' + (workout.status === 'skipped' ? 'пропуск' : 'выполнено') + '\n'; (workout.exercises || []).forEach(function (exercise) { markdown += '- ' + exercise.name + ': ' + (exercise.sets || []).map(function (set) { return [set.reps ? set.reps + ' повт.' : '', set.weight !== '' ? set.weight + ' кг' : '', set.rir !== '' ? 'RIR ' + set.rir : ''].filter(Boolean).join(', '); }).join(' | ') + '\n'; }); if (workout.notes) markdown += '- Заметка: ' + workout.notes + '\n'; });
        markdown += '\n## Показатели\n';
        payload.measurements.forEach(function (item) { markdown += '- ' + item.date + ': ' + [item.weight ? item.weight + ' кг' : '', item.steps ? item.steps + ' шагов' : '', item.walkMinutes ? item.walkMinutes + ' мин прогулки' : '', item.feeling ? 'самочувствие ' + item.feeling + '/5' : ''].filter(Boolean).join(', ') + (item.notes ? ' — ' + item.notes : '') + '\n'; });
        return core.download('almanion-sport-ai.md', markdown, 'text/markdown;charset=utf-8');
    }

    function bindEvents() {
        refs.personalGateLogin.addEventListener('click', function () { if (win.AlmanionAccount) win.AlmanionAccount.openLogin(); });
        refs.sportWeekSelect.addEventListener('change', function () { store.updateSettings({ currentProgramWeek: Number(this.value) }); });
        refs.sportStartWorkout.addEventListener('click', function () { const next = nextSession(); openWorkout(next.entry.session, next.date); });
        refs.sportTabs.addEventListener('click', function (event) { const button = event.target.closest('[data-sport-view]'); if (!button) return; view = button.dataset.sportView; render(); });
        refs.sportContent.addEventListener('click', function (event) {
            const start = event.target.closest('[data-start-session]');
            if (start) return openWorkout(start.dataset.startSession, start.dataset.sessionDate);
            const workout = event.target.closest('[data-edit-workout]');
            if (workout) return openWorkout('', '', workout.dataset.editWorkout);
            const metric = event.target.closest('[data-edit-metric]');
            if (metric) return openMetric(metric.dataset.editMetric);
            if (event.target.closest('[data-add-metric]')) return openMetric('');
            const exporter = event.target.closest('[data-export-sport]');
            if (exporter) exportSport(exporter.dataset.exportSport);
        });
        refs.sportSessionPicker.addEventListener('change', function (event) { if (event.target.name === 'sportSession') changeWorkoutSession(event.target.value); });
        refs.sportWorkoutForm.addEventListener('submit', function (event) { saveWorkout(event, 'completed'); });
        refs.sportSkipWorkout.addEventListener('click', skipOrDeleteWorkout);
        refs.sportMetricForm.addEventListener('submit', saveMetric);
        refs.sportDeleteMetric.addEventListener('click', deleteMetric);
        doc.querySelectorAll('[data-close-modal]').forEach(function (button) { button.addEventListener('click', function () { closeModal(button.closest('.planner-modal-layer')); }); });
        doc.querySelectorAll('.planner-modal-layer').forEach(function (layer) { layer.addEventListener('click', function (event) { if (event.target === layer) closeModal(layer); }); });
        doc.addEventListener('keydown', function (event) { if (event.key === 'Escape') doc.querySelectorAll('.planner-modal-layer:not([hidden])').forEach(closeModal); });
    }

    function init() {
        cacheRefs();
        bindEvents();
        store.subscribe(function (next, detail) { state = next; if (authorized) render(); if (detail && detail.source === 'error') toast('Нет сети: запись сохранена на устройстве', 'info'); });
        showGate('checking');
        win.addEventListener('almanion-account-ready', function (event) { handleAccount(event.detail && event.detail.user); });
        const account = win.AlmanionAccount;
        if (account && account.auth && typeof account.auth.onAuthStateChanged === 'function') account.auth.onAuthStateChanged(handleAccount);
        else handleAccount(account && account.getUser ? account.getUser() : null);
    }

    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
}(window));
