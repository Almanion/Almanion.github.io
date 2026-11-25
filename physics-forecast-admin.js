(function () {
    'use strict';
    const M = window.PhysicsForecast;
    const $ = id => document.getElementById(id);
    const templates = [
        { label: 'Работа по физике', ...M.physics },
        { label: 'Домашнее задание', question: 'Зададут ли домашнюю работу по геометрии?', criteria: 'Считается задание для всего класса, записанное в электронном дневнике в день события.' },
        { label: 'Школьный матч', question: 'Выиграет ли 10-1 матч?', criteria: 'Ответ «Да» — победа 10-1 по официальному результату матча.' }
    ];
    const confirmations = {
        lock: 'Закрыть торги и снять оставшиеся заявки?',
        yes: 'Объявить итог «Да» и начислить выплаты?',
        no: 'Объявить итог «Нет» и начислить выплаты?',
        void: 'Отменить прогноз и вернуть очки за все сделки по нему?'
    };
    const clean = text => text.trim().replace(/\s+/gu, ' ');

    window.createForecastAdmin = function ({ now, formatDate, phaseLabel, selectMarket, send }) {
        const panel = $('ownerTools'), form = $('createRound'), date = $('newDay');
        const template = $('eventTemplate'), question = $('eventQuestion'), criteria = $('newCriteria');
        const commands = [...panel.querySelectorAll('[data-command]')];
        const dateButtons = [...panel.querySelectorAll('[data-offset]')];
        let current, markets = [], creating = false, busy = false, disabled = true, pending = null, initialized = false;
        question.maxLength = M.QUESTION_LIMIT;
        criteria.maxLength = M.CRITERIA_LIMIT;
        templates.forEach((item, i) => template.add(new Option(item.label, String(i))));

        function dismiss() {
            pending = null;
            $('confirmAction').hidden = true;
            $('confirmText').textContent = '';
        }
        function displayMode() {
            const create = creating || !current;
            $('showManage').disabled = !current || busy;
            $('showCreate').disabled = busy;
            $('showManage').setAttribute('aria-pressed', String(!create));
            $('showCreate').setAttribute('aria-pressed', String(create));
            $('manageRound').hidden = create;
            form.hidden = !create;
        }
        function setMode(create) {
            creating = create;
            dismiss();
            $('adminFeedback').textContent = '';
            displayMode();
        }
        function syncDate() {
            for (const button of dateButtons) {
                button.setAttribute('aria-pressed', String(date.value === M.dayKey(now() + Number(button.dataset.offset) * M.DAY)));
            }
        }
        function canApply(kind, phase) {
            if (!current) return false;
            if (kind === 'lock') return phase === 'open';
            if (kind === 'void') return phase === 'open' || phase === 'lock';
            return phase === 'lock' && now() >= current.endAt - M.DAY;
        }
        function anotherPending() {
            return markets.find(m => m.id !== current?.id && M.status(m, now()) === 'lock' && now() >= m.endAt - M.DAY);
        }
        function render(owner, selected, ordered, saving, connected) {
            panel.hidden = !owner;
            if (!owner) return;
            current = selected;
            markets = ordered;
            busy = saving;
            disabled = busy || !connected;
            if (!initialized) {
                panel.open = !current;
                creating = !current;
                initialized = true;
            }
            const today = M.dayKey(now());
            date.min = today;
            date.max = M.dayKey(now() + 31 * M.DAY);
            if (!date.value) date.value = today;
            syncDate();
            displayMode();
            $('eventFields').disabled = busy;
            form.querySelector('[type="submit"]').disabled = disabled;
            if (!current) { dismiss(); return; }
            const phase = M.status(current, now());
            $('manageTitle').textContent = current.question;
            const status = phase === 'lock' && now() < current.endAt - M.DAY ? 'Итог можно указать в день события' : phaseLabel[phase];
            $('manageStatus').textContent = formatDate(current.date) + ' · ' + status;
            for (const button of commands) {
                button.hidden = !canApply(button.dataset.command, phase);
                button.disabled = disabled;
            }
            if (pending && (pending.day !== current.id || !canApply(pending.kind, phase))) dismiss();
            $('confirmGo').disabled = disabled;
            $('repeatEvent').disabled = busy;
            $('nextPending').hidden = !anotherPending();
            $('nextPending').disabled = busy;
        }
        function resetForm() {
            form.reset();
            question.setCustomValidity('');
        }
        function reset() {
            current = null; markets = []; creating = busy = initialized = false; disabled = true;
            dismiss(); resetForm(); panel.open = false;
            $('manageTitle').textContent = $('manageStatus').textContent = '';
        }
        $('showCreate').addEventListener('click', () => { setMode(true); template.focus(); });
        $('showManage').addEventListener('click', () => setMode(false));
        $('nextPending').addEventListener('click', () => { const next = anotherPending(); if (next) selectMarket(next.id); });
        template.addEventListener('change', () => {
            const preset = template.value === '' ? null : templates[Number(template.value)];
            question.value = preset?.question || '';
            criteria.value = preset?.criteria || '';
            question.setCustomValidity('');
        });
        form.addEventListener('input', e => {
            if (e.target === date) syncDate();
            if (e.target === question || e.target === criteria) {
                template.value = '';
                question.setCustomValidity('');
            }
        });
        for (const button of dateButtons) button.addEventListener('click', () => {
            date.value = M.dayKey(now() + Number(button.dataset.offset) * M.DAY);
            syncDate();
        });
        $('repeatEvent').addEventListener('click', () => {
            if (!current) return;
            setMode(true);
            template.value = '';
            question.value = current.question; criteria.value = current.criteria;
            question.setCustomValidity('');
            const tomorrow = now() + M.DAY;
            const next = M.dayKey(Math.max(tomorrow, current.endAt));
            date.value = next > date.max ? M.dayKey(tomorrow) : next;
            syncDate(); date.focus();
        });
        form.addEventListener('submit', e => {
            e.preventDefault();
            if (panel.hidden || disabled) return;
            const title = clean(question.value), condition = clean(criteria.value);
            if (!title) { question.setCustomValidity('Напиши вопрос о событии.'); question.reportValidity(); return; }
            const same = markets.find(m => m.phase !== 'void' && m.date === date.value && clean(m.question).toLowerCase() === title.toLowerCase());
            if (same) { selectMarket(same.id); $('adminFeedback').textContent = 'Прогноз с этим вопросом на эту дату уже есть.'; return; }
            send({ kind: 'open', question: title, ...(condition ? { criteria: condition } : {}), endAt: M.endOfDay(date.value) });
        });
        for (const button of commands) button.addEventListener('click', () => {
            if (!current || disabled || panel.hidden) return;
            const kind = button.dataset.command;
            if (!canApply(kind, M.status(current, now()))) return;
            pending = { kind, day: current.id };
            $('confirmText').textContent = current.question + ' · ' + formatDate(current.date) + '. ' + confirmations[kind];
            $('confirmAction').hidden = false;
            $('confirmBack').focus();
        });
        $('confirmBack').addEventListener('click', () => {
            const button = commands.find(b => b.dataset.command === pending?.kind);
            dismiss(); button?.focus();
        });
        $('confirmGo').addEventListener('click', () => {
            const command = pending;
            dismiss();
            if (command && current?.id === command.day && !disabled && canApply(command.kind, M.status(current, now()))) send(command);
        });
        return { render, reset, resetForm, showSelected: () => setMode(false) };
    };
}());
