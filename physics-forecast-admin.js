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
        liquidity: 'Включить пополнение заявок на продажу из резерва площадки?',
        lock: 'Закрыть торги и снять оставшиеся заявки?',
        void: 'Отменить прогноз и вернуть очки за все сделки по нему?'
    };
    const clean = text => text.trim().replace(/\s+/gu, ' ');

    window.createForecastAdmin = function ({ now, formatDate, phaseLabel, selectMarket, send }) {
        const panel = $('ownerTools'), form = $('createRound'), date = $('newDay');
        const template = $('eventTemplate'), question = $('eventQuestion'), criteria = $('newCriteria');
        const clockInput = $('newTime'), editTime = $('manageDeadline'), deadlineEditor = $('editDeadline');
        const addAnswer = $('addAnswer'), editor = $('answerEditor'), actions = panel.querySelector('.forecast-manager-actions');
        const commands = () => [...actions.querySelectorAll('[data-command]')];
        const localMinute = at => M.dayKey(at) + 'T' + window.ForecastLedger.time.format(at);
        const dateButtons = [...panel.querySelectorAll('[data-offset]')];
        let current, markets = [], creating = false, busy = false, disabled = true, pending = null, initialized = false;
        question.maxLength = M.QUESTION_LIMIT;
        criteria.maxLength = M.CRITERIA_LIMIT;
        templates.forEach((item, i) => template.add(new Option(item.label, String(i))));

        function answerInputs() { return [...editor.querySelectorAll('input')]; }
        function setAnswers(labels = Object.values(M.DEFAULT_ANSWERS), focus = -1) {
            for (const row of editor.querySelectorAll('.forecast-answer-row')) row.remove();
            labels.forEach((label, index) => {
                const row = document.createElement('div'), input = document.createElement('input');
                row.className = 'forecast-answer-row';
                input.type = 'text'; input.value = label; input.maxLength = M.ANSWER_LIMIT; input.required = true;
                input.setAttribute('aria-label', 'Вариант ' + (index + 1)); input.placeholder = 'Вариант ' + (index + 1);
                row.append(input);
                if (index >= 2) {
                    const remove = document.createElement('button');
                    remove.type = 'button'; remove.className = 'forecast-secondary'; remove.textContent = '×';
                    remove.setAttribute('aria-label', 'Удалить вариант ' + (index + 1));
                    remove.addEventListener('click', () => {
                        const values = answerInputs().map(el => el.value); values.splice(index, 1);
                        setAnswers(values); addAnswer.focus();
                    });
                    row.append(remove);
                }
                editor.insertBefore(row, addAnswer);
                if (index === focus) input.focus();
            });
            addAnswer.hidden = labels.length >= M.SIDE_IDS.length;
        }
        addAnswer.addEventListener('click', () => {
            const values = answerInputs().map(el => el.value);
            if (values.length < M.SIDE_IDS.length) setAnswers([...values, ''], values.length);
        });
        setAnswers();

        function setWinners(market) {
            for (const old of actions.querySelectorAll('[data-winner]')) old.remove();
            const cancel = actions.querySelector('[data-command="void"]');
            for (const side of market.sides) {
                const button = document.createElement('button');
                button.type = 'button'; button.className = 'forecast-secondary';
                button.dataset.command = side; button.dataset.winner = '';
                button.textContent = 'Итог «' + market.answers[side] + '»'; actions.insertBefore(button, cancel);
            }
        }
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
            if (kind === 'liquidity') return phase === 'open' && !current.liquidity;
            if (kind === 'lock') return phase === 'open';
            if (kind === 'void') return phase === 'open' || phase === 'lock';
            return current.sides.includes(kind) && phase === 'lock' && now() >= current.eventEnd - M.DAY;
        }
        function anotherPending() {
            return markets.find(m => m.id !== current?.id && M.status(m, now()) === 'lock' && now() >= m.eventEnd - M.DAY);
        }
        let shownId = '', shownDeadline = null;
        function render(owner, selected, ordered, saving, connected) {
            panel.hidden = !owner;
            if (!owner) return;
            current = selected;
            markets = ordered;
            busy = saving;
            disabled = busy || !connected;
            if (!initialized) {
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
            if (shownId !== current.id || shownDeadline !== current.endAt) {
                if (shownId !== current.id) setWinners(current);
                shownId = current.id; shownDeadline = current.endAt;
                deadlineEditor.open = false; editTime.value = localMinute(current.endAt); editTime.setCustomValidity('');
            }
            deadlineEditor.hidden = phase !== 'open';
            $('deadlineForm').querySelector('button').disabled = disabled;
            editTime.disabled = busy;
            editTime.min = localMinute((Math.floor(now() / 60000) + 1) * 60000);
            editTime.max = localMinute(current.eventEnd);
            $('manageTitle').textContent = current.question;
            $('manageCriteria').textContent = current.criteria;
            $('manageCriteria').hidden = !current.criteria;
            const status = phase === 'lock' && now() < current.eventEnd - M.DAY ? 'Итог можно указать в день события' : phaseLabel(current, phase);
            $('manageStatus').textContent = formatDate(current.date) + ' · ' + status + (phase === 'open' ? ' до ' + window.ForecastLedger.cutoff(current.endAt, current.date) : '');
            for (const button of commands()) {
                const kind = button.dataset.command;
                button.hidden = !canApply(kind, phase) || (kind === 'liquidity' && disabled);
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
            question.setCustomValidity(''); clockInput.setCustomValidity(''); setAnswers();
        }
        function reset() {
            current = null; markets = []; creating = busy = initialized = false; disabled = true;
            dismiss(); resetForm(); panel.hidden = true; shownId = ''; shownDeadline = null;
            $('adminFeedback').textContent = $('manageCriteria').textContent = '';
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
            if (preset) setAnswers();
        });
        form.addEventListener('input', e => {
            if (e.target === date) syncDate();
            if (e.target === date || e.target === clockInput) clockInput.setCustomValidity('');
            if (editor.contains(e.target)) answerInputs().forEach(input => input.setCustomValidity(''));
            if (e.target === question || e.target === criteria) {
                template.value = '';
                question.setCustomValidity('');
            }
        });
        for (const button of dateButtons) button.addEventListener('click', () => {
            date.value = M.dayKey(now() + Number(button.dataset.offset) * M.DAY);
            clockInput.setCustomValidity('');
            syncDate();
        });
        $('repeatEvent').addEventListener('click', () => {
            if (!current) return;
            setMode(true);
            template.value = '';
            question.value = current.question; criteria.value = current.criteria;
            question.setCustomValidity(''); clockInput.setCustomValidity('');
            setAnswers(current.sides.map(id => current.answers[id]));
            clockInput.value = current.endAt === current.eventEnd ? '' : window.ForecastLedger.time.format(current.endAt);
            const tomorrow = now() + M.DAY;
            const next = M.dayKey(Math.max(tomorrow, current.eventEnd));
            date.value = next > date.max ? M.dayKey(tomorrow) : next;
            syncDate(); date.focus();
        });
        form.addEventListener('submit', e => {
            e.preventDefault();
            if (panel.hidden || disabled) return;
            const title = clean(question.value), condition = clean(criteria.value);
            if (!title) { question.setCustomValidity('Напиши вопрос о событии.'); question.reportValidity(); return; }
            const eventEnd = M.endOfDay(date.value), endAt = M.deadline(date.value, clockInput.value);
            if (!M.validDeadline(endAt, now(), eventEnd)) {
                clockInput.setCustomValidity('Укажи будущее время закрытия по Москве.'); clockInput.reportValidity(); return;
            }
            const inputs = answerInputs(), answers = {}, used = new Set();
            for (const [i, input] of inputs.entries()) {
                const label = clean(input.value), key = label.toLowerCase();
                if (!label || used.has(key)) {
                    input.setCustomValidity(label ? 'Такой вариант уже есть.' : 'Введи название варианта.'); input.reportValidity(); return;
                }
                answers[M.SIDE_IDS[i]] = label; used.add(key);
            }
            const same = markets.find(m => m.phase !== 'void' && m.date === date.value && clean(m.question).toLowerCase() === title.toLowerCase());
            if (same) { selectMarket(same.id); $('adminFeedback').textContent = 'Прогноз с этим вопросом на эту дату уже есть.'; return; }
            send({ kind: 'open', question: title, ...(condition ? { criteria: condition } : {}), eventEnd, endAt, answers, liquidity: 1 });
        });
        editTime.addEventListener('input', () => editTime.setCustomValidity(''));
        $('deadlineForm').addEventListener('submit', event => {
            event.preventDefault();
            if (disabled || !current || M.status(current, now()) !== 'open') return;
            const [day, time] = editTime.value.split('T'), endAt = M.deadline(day, time);
            if (!M.validDeadline(endAt, now(), current.eventEnd)) {
                editTime.setCustomValidity('Выбери будущее время в пределах даты события.'); editTime.reportValidity(); return;
            }
            if (endAt !== current.endAt) send({ kind: 'deadline', day: current.id, endAt });
            else deadlineEditor.open = false;
        });
        actions.addEventListener('click', event => {
            const button = event.target.closest('[data-command]');
            if (!button || !current || disabled || panel.hidden) return;
            const kind = button.dataset.command;
            if (!canApply(kind, M.status(current, now()))) return;
            pending = { kind, day: current.id };
            const message = confirmations[kind] || 'Объявить итог «' + current.answers[kind] + '» и начислить выплаты?';
            $('confirmText').textContent = current.question + ' · ' + formatDate(current.date) + '. ' + message;
            $('confirmAction').hidden = false;
            $('confirmBack').focus();
        });
        $('confirmBack').addEventListener('click', () => {
            const button = commands().find(b => b.dataset.command === pending?.kind);
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
