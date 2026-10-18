(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root && root.document) api.init(root);
}(typeof window !== 'undefined' ? window : null, function () {
    'use strict';

    function schoolDate(date) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(date || new Date());
        const part = type => parts.find(item => item.type === type).value;
        return part('year') + '-' + part('month') + '-' + part('day');
    }

    function stateForDays(days, today) {
        if (!days.length) return null;
        const ordered = days.slice().sort((a, b) => a.date.localeCompare(b.date));
        if (today > ordered[ordered.length - 1].date) return null;
        if (today < ordered[0].date) return { kind: 'upcoming', ...ordered[0] };
        const current = ordered.find(day => day.date === today);
        return current ? { kind: 'today', ...current } : { kind: 'none', date: today, people: [] };
    }

    function init(win) {
        const doc = win.document;
        const section = doc.getElementById('homeDailyDuty');
        const template = doc.getElementById('homeExtraDutyDays');
        if (!section || !template || section.dataset.ready) return;
        section.dataset.ready = 'true';
        const days = Array.from(template.content.querySelectorAll('[data-duty-date]'), day => ({
            date: day.dataset.dutyDate,
            people: Array.from(day.querySelectorAll('li'), person => person.textContent.trim())
        }));
        let renderedDate = '';

        function render() {
            const today = schoolDate(new Date());
            if (today === renderedDate) return;
            renderedDate = today;
            const state = stateForDays(days, today);
            section.hidden = !state;
            if (!state) return;
            section.dataset.state = state.kind;
            doc.getElementById('homeDailyDutyTitle').textContent = state.kind === 'today'
                ? 'Сегодня дежурят' : state.kind === 'upcoming' ? 'Ближайшее дежурство' : 'Сегодня без дежурства';
            const date = doc.getElementById('homeDailyDutyDate');
            date.dateTime = state.date;
            date.textContent = new Intl.DateTimeFormat('ru-RU', {
                timeZone: 'Europe/Moscow', weekday: 'long', day: 'numeric', month: 'long'
            }).format(new Date(state.date + 'T12:00:00Z'));
            const people = doc.getElementById('homeDailyDutyPeople');
            people.replaceChildren(...state.people.map(person => {
                const item = doc.createElement('li');
                item.textContent = person;
                return item;
            }));
            people.hidden = !state.people.length;
            doc.getElementById('homeDailyDutyMessage').hidden = state.kind !== 'none';
        }

        render();
        win.setInterval(function () { if (!doc.hidden) render(); }, 60000);
        doc.addEventListener('visibilitychange', function () { if (!doc.hidden) render(); });
        win.addEventListener('pageshow', render);
    }

    return { schoolDate: schoolDate, stateForDays: stateForDays, init: init };
}));
