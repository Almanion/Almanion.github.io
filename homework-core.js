(function (root, factory) {
    'use strict';
    const api = factory(typeof module === 'object' && module.exports ? require('./personal-planner-core.js') : root.AlmanionPlannerCore);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AlmanionHomework = api;
}(typeof window !== 'undefined' ? window : globalThis, function (planner) {
    'use strict';
    const SUBJECTS = [
        ['Алгебра', 'math.html', '#8b7bd0'], ['Геометрия', 'geometry.html', '#7095c5'],
        ['Физика', 'physics-10.html', '#659bc7'], ['Химия', 'chemistry-10.html', '#69a990'],
        ['Русский язык', 'russian-ege.html', '#c1899a'], ['Литература', 'literature-10.html', '#bd9c72'],
        ['Английский язык', 'english.html', '#7a9fad'], ['Информатика', '', '#8392cb'],
        ['Биология', '', '#8ca773'], ['История', '', '#b1987c'], ['Обществознание', '', '#a58cae'],
        ['География', '', '#76a3a0'], ['ОБЗР', '', '#9b9e7e'], ['Индивидуальный проект', '', '#8f99ab']
    ].map(function (row) { return { name: row[0], href: row[1], color: row[2] }; });
    const clean = function (value) { return String(value || '').trim(); };
    const normalize = function (value) { return clean(value).toLocaleLowerCase('ru').replace(/ё/g, 'е'); };
    function subject(name) { return SUBJECTS.find(function (item) { return normalize(item.name) === normalize(name); }) || { name: name, href: '', color: '#8f99ab' }; }
    function safeUrl(value) {
        if (!clean(value)) return '';
        try {
            const url = new URL(value);
            if (url.protocol !== 'https:' || url.username || url.password || url.hostname !== 'app.eschool.center' || url.port) return '';
            return url.href;
        } catch (_) { return ''; }
    }
    function isHomework(task) { return !!task && task.homework && task.homework.version === 1; }
    function progress(task) { return task.done ? 'done' : ['doing', 'help'].includes(task.homework.phase) ? task.homework.phase : 'todo'; }
    function pendingSubmission(task) { return task.done === true && task.homework.requiresSubmission && !task.homework.reportedSubmission; }
    function list(tasks) { return Object.values(tasks || {}).filter(isHomework); }
    function makeTask(input, existing) {
        const title = clean(input.title), name = clean(input.subject), date = clean(input.date);
        const minutes = Number(input.minutes), total = Number(input.total || 0), completed = Number(input.completed || 0);
        if (!title || title.length > 160) throw new Error('Укажите задание длиной до 160 символов.');
        if (!name || name.length > 50) throw new Error('Укажите предмет длиной до 50 символов.');
        if (!Number.isFinite(planner.parseDate(date).getTime())) throw new Error('Укажите корректную дату сдачи.');
        if (!Number.isInteger(minutes) || minutes < 0 || minutes > 480) throw new Error('Оставшееся время — от 0 до 480 минут.');
        if (!Number.isInteger(total) || !Number.isInteger(completed) || total < 0 || total > 200 || completed < 0 || completed > total) throw new Error('Проверьте количество задач: решённых не может быть больше общего числа.');
        if (clean(input.notes).length > 1200) throw new Error('Заметка должна быть не длиннее 1200 символов.');
        const url = safeUrl(clean(input.sourceUrl));
        if (clean(input.sourceUrl) && (!url || url.length > 512)) throw new Error('Укажите ссылку https://app.eschool.center/ без логина и пароля в адресе.');
        const previous = existing && existing.homework || {};
        const done = input.status === 'done';
        return {
            id: existing && existing.id || planner.safeId('homework'), title: title, category: 'school', date: date,
            deadlineTime: '', recurrence: { frequency: 'none', interval: 1 }, notes: clean(input.notes), done: done,
            createdAt: existing && existing.createdAt || Date.now(), updatedAt: Date.now(),
            homework: {
                version: 1, subject: name, phase: ['doing', 'help'].includes(input.status) ? input.status : 'todo',
                minutes: minutes, priority: input.priority === 'high' ? 'high' : 'normal',
                requiresSubmission: input.requiresSubmission === true,
                reportedSubmission: previous.reportedSubmission === true,
                reportedAt: Number(previous.reportedAt) || 0, archived: previous.archived === true,
                total: total, completed: done && total ? total : completed, sourceUrl: url
            }
        };
    }
    function filter(tasks, options) {
        const query = normalize(options.query), name = options.subject || '';
        return list(tasks).filter(function (task) {
            const meta = task.homework;
            if (!!meta.archived !== (options.view === 'archive')) return false;
            if (name && meta.subject !== name) return false;
            if (query && !normalize(task.title + ' ' + task.notes + ' ' + meta.subject).includes(query)) return false;
            if (options.view === 'send') return pendingSubmission(task);
            if (options.view === 'now') return !task.done || pendingSubmission(task);
            return true;
        }).sort(function (a, b) {
            return Number(a.done) - Number(b.done) || a.date.localeCompare(b.date) || Number(b.homework.priority === 'high') - Number(a.homework.priority === 'high') || a.title.localeCompare(b.title, 'ru');
        });
    }
    function recommendations(tasks, today, budget) {
        return tasks.filter(function (task) { return !task.homework.archived && (!task.done || pendingSubmission(task)); })
            .slice().sort(function (a, b) {
                return Number(pendingSubmission(b)) - Number(pendingSubmission(a)) ||
                    Number(b.date <= today) - Number(a.date <= today) ||
                    Number(b.homework.priority === 'high') - Number(a.homework.priority === 'high') ||
                    a.date.localeCompare(b.date) ||
                    Number(a.homework.minutes > budget) - Number(b.homework.minutes > budget) || a.title.localeCompare(b.title, 'ru');
            }).slice(0, 3).map(function (task) {
                let reason = pendingSubmission(task) ? 'Работа готова — осталось отправить' : task.date < today ? 'Срок сдачи прошёл' : task.date === today ? 'Сдать сегодня' : task.date === planner.addDays(today, 1) ? 'К завтрашнему дню' : 'Можно начать заранее';
                if (!task.done && task.homework.minutes) reason += task.homework.minutes > budget ? ' · начните с ' + budget + ' минут' : ' · около ' + task.homework.minutes + ' мин';
                return { task: task, reason: reason };
            });
    }
    return { SUBJECTS: SUBJECTS, subject: subject, safeUrl: safeUrl, isHomework: isHomework, progress: progress, pendingSubmission: pendingSubmission, list: list, makeTask: makeTask, filter: filter, recommendations: recommendations };
}));
