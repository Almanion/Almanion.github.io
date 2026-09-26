/* Pure, backward-compatible helpers. No series are inferred from legacy rows. */
(function (root) {
    'use strict';
    function text(value) { return String(value == null ? '' : value).trim(); }
    function normalize(value) { return text(value).toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' '); }
    function date(value) {
        let raw = text(value);
        const ru = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (ru) raw = ru[3] + '-' + ru[2] + '-' + ru[1];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
        const parsed = new Date(raw + 'T12:00:00Z');
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : '';
    }
    function series(task) {
        const raw = task.series && typeof task.series === 'object' ? task.series : task;
        const id = text(raw === task ? task.seriesId : raw.id);
        // A deliberate opt-in, never the sheet name, task status or a guessed date.
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) return null;
        return { id, title: text(raw === task ? task.seriesTitle : raw.title).slice(0, 160) || 'Серия ' + id,
            date: date(raw === task ? task.seriesDate : raw.date), year: text(raw === task ? task.academicYear : raw.year).slice(0, 30) };
    }
    function seriesKey(task) {
        const item = series(task);
        return item ? JSON.stringify([task.grade, Number(task._endpointIdx) || 0, item.id]) : '';
    }
    function identity(task) {
        return JSON.stringify([Number(task._endpointIdx) || 0, task.grade,
            task.taskId || [task.sourceSheet || '', series(task)?.id || '', String(task.numberText || task.number)]]);
    }
    function seriesList(tasks, grade) {
        const items = new Map();
        tasks.forEach(task => {
            if (task.grade !== grade || !Number.isInteger(task.number)) return;
            const item = series(task), key = seriesKey(task);
            if (!item) return;
            if (!items.has(key)) items.set(key, { ...item, key, tasks: [] });
            items.get(key).tasks.push(task);
        });
        return Array.from(items.values()).sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'ru', { numeric: true }));
    }
    function initialGrade(saved, home) {
        const allowed = ['grade-9', 'grade-10', 'grade-11', 'grade-summer-9-10', 'grade-summer-10-11'];
        if (allowed.includes(saved)) return saved;
        return ['9', '10', '11'].includes(home) ? 'grade-' + home : 'grade-10';
    }
    function stem(word) {
        if (word.length < 4) return word;
        const endings = ['ениями','аниями','ностью','ностями','ениями','аниях','ениях','ением','анием','остей','ости','ость','ения','ание','ению','анию','ами','ями','ими','ыми','ого','его','ому','ему','ться','ах','ях','ам','ям','ым','им','ых','их','ов','ев','ой','ей','ую','юю','ся','сь','ть','ти','ый','ий','ые','ие','ая','яя','ое','ее','а','я','у','ю','е','о','и','ы'];
        const ending = endings.find(e => word.endsWith(e) && word.length - e.length >= 3);
        return ending ? word.slice(0, -ending.length) : word;
    }
    const index = new WeakMap();
    function indexed(task) {
        const source = normalize([task.numberText, task.description, task.hint, series(task)?.title].join(' '));
        const cached = index.get(task);
        if (cached?.source === source) return cached;
        const entry = { source, stems: new Set((source.match(/[а-яa-z]+/g) || []).map(stem)) };
        index.set(task, entry);
        return entry;
    }
    function matches(task, query) {
        const q = normalize(query);
        if (!q) return true;
        // Numbers are exact: 12 must not silently find 112 or numbers in a hint.
        const numeric = q.match(/^(?:№\s*|#\s*|задача\s+)?(\d+(?:[.,]\d+)?)$/);
        if (numeric) return Number(numeric[1].replace(',', '.')) === task.number;
        const data = indexed(task);
        const tokens = Array.from(q.matchAll(/"([^"]+)"|(\S+)/g));
        return tokens.every(match => {
            if (match[1]) return data.source.includes(match[1]);
            const token = match[2];
            if (data.source.includes(token)) return true;
            return /^[а-яa-z]{4,}$/.test(token) && data.stems.has(stem(token));
        });
    }
    const api = { series, seriesKey, identity, seriesList, initialGrade, matches, normalize, date };
    root.MatcenterWorkspaceModel = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
