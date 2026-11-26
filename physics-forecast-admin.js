(function () {
    'use strict';
    const M = window.PhysicsForecast;
    const $ = id => document.getElementById(id);
    const templateGroups = {
        'Уроки': [
            { label: 'Работа по физике', ...M.physics },
            {
                label: 'Домашнее задание',
                question: 'Зададут ли домашнюю работу по геометрии?',
                criteria: '«Да», если к концу дня в электронном дневнике под сегодняшним уроком геометрии появится задание для всего класса.'
            },
            {
                label: 'Задачи по геометрии',
                question: 'Сколько задач разберут у доски на первом уроке геометрии?',
                answers: ['Ни одной', '1–2 задачи', '3–4 задачи', '5 и больше'],
                criteria: 'Считаем разные задачи, решение которых довели до ответа у доски за этот урок. Два способа решения одной задачи считаются за одну. Если урок отменят, прогноз отменяется.'
            },
            {
                label: 'Опыт по химии',
                question: 'Кто проведёт первый опыт на уроке химии?',
                answers: ['Учитель', 'Ученики', 'Опыта не будет'],
                criteria: 'Берём первый опыт, который проведут в классе в день события. Если хотя бы один ученик сам выполняет опыт, выбираем «Ученики». Видеозапись опыта не учитывается. Если урок отменят, прогноз отменяется.'
            }
        ],
        'Кружки и события': [
            {
                label: 'Объём серии',
                question: 'Сколько задач будет в новой серии маткружка?',
                answers: ['До 5 включительно', '6–8', '9–11', '12 и больше'],
                criteria: 'Считаем пронумерованные задачи в первой серии, выданной в день занятия. Подпункты одного номера считаются за одну задачу. Если серию не выдадут, прогноз отменяется.'
            },
            {
                label: 'Посещаемость кружка',
                question: 'Сколько учеников придёт на математический кружок?',
                answers: ['До 10 включительно', '11–20', '21 и больше'],
                criteria: 'Считаем учеников в аудитории через десять минут после начала занятия. Ведущие кружка в подсчёт не входят. Если занятие отменят, прогноз отменяется.'
            },
            {
                label: 'Начало концерта',
                question: 'Когда начнётся школьный концерт?',
                answers: ['Вовремя или раньше', 'На 1–10 минут позже', 'Больше чем на 10 минут позже'],
                criteria: 'Сравниваем объявленное время с минутой первого приветствия ведущего со сцены. Используем часы и минуты без секунд. Если в этот день концерт не состоится, прогноз отменяется.'
            }
        ],
        'Спорт': [
            {
                label: 'Школьный матч',
                question: 'Выиграет ли 10-1 матч?',
                criteria: 'Берём официальный результат первого матча класса в этот день, включая дополнительное время и пенальти. Ничья означает «Нет». Если матч не завершится в этот день, прогноз отменяется.'
            },
            {
                label: 'Итог матча',
                question: 'Чем закончится первый футбольный матч нашего класса?',
                answers: ['Победа класса', 'Ничья', 'Победа соперника'],
                criteria: 'Берём счёт по окончании основного времени, включая добавленные минуты. Дополнительные таймы и серия пенальти в итог не входят. Если матч в этот день не доиграют до конца основного времени, прогноз отменяется.'
            },
            {
                label: 'Голы в матче',
                question: 'Сколько голов забьют обе команды в первом матче нашего класса?',
                answers: ['0 голов', '1–2 гола', '3–4 гола', '5 и больше'],
                criteria: 'Складываем голы обеих команд к концу основного времени, включая добавленные минуты. Голы в серии пенальти не учитываются. Если основное время не доиграют в этот день, прогноз отменяется.'
            }
        ],
        'Погода': [
            {
                label: 'Температура в полдень',
                question: 'Какую температуру покажет уличный термометр у школы в полдень?',
                answers: ['Ниже 0 °C', 'От 0 до +10 °C включительно', 'Выше +10 °C'],
                criteria: 'Берём показание на первом фото уличного термометра у главного входа, сделанном с 12:00 до 12:10. Если фото нет, прогноз отменяется.'
            },
            {
                label: 'Осадки на перемене',
                question: 'Будут ли осадки в начале большой перемены?',
                criteria: 'Смотрим у главного входа сразу после звонка на первую большую перемену. «Да», если в этот момент идёт дождь, снег или град. Лужи и снег на земле не считаются. Если никто не проверил, прогноз отменяется.'
            }
        ]
    };
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
        const presets = new Map();
        for (const [groupLabel, items] of Object.entries(templateGroups)) {
            const group = document.createElement('optgroup');
            group.label = groupLabel;
            for (const item of items) {
                presets.set(item.label, item);
                group.append(new Option(item.label, item.label));
            }
            template.append(group);
        }

        function answerInputs() { return [...editor.querySelectorAll('input')]; }
        let customDraft = null;
        function rememberCustomDraft() {
            template.value = '';
            customDraft = {
                question: question.value,
                criteria: criteria.value,
                answers: answerInputs().map(input => input.value)
            };
        }
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
                        setAnswers(values); rememberCustomDraft(); addAnswer.focus();
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
            if (values.length < M.SIDE_IDS.length) {
                setAnswers([...values, ''], values.length);
                rememberCustomDraft();
            }
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
            customDraft = null;
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
            const chosen = presets.get(template.value) || customDraft;
            question.value = chosen?.question || '';
            criteria.value = chosen?.criteria || '';
            question.setCustomValidity('');
            setAnswers(chosen?.answers);
        });
        form.addEventListener('input', e => {
            if (e.target === date) syncDate();
            if (e.target === date || e.target === clockInput) clockInput.setCustomValidity('');
            const editingAnswer = editor.contains(e.target);
            if (editingAnswer) answerInputs().forEach(input => input.setCustomValidity(''));
            if (e.target === question) question.setCustomValidity('');
            if (e.target === question || e.target === criteria || editingAnswer) rememberCustomDraft();
        });
        for (const button of dateButtons) button.addEventListener('click', () => {
            date.value = M.dayKey(now() + Number(button.dataset.offset) * M.DAY);
            clockInput.setCustomValidity('');
            syncDate();
        });
        $('repeatEvent').addEventListener('click', () => {
            if (!current) return;
            setMode(true);
            question.value = current.question; criteria.value = current.criteria;
            question.setCustomValidity(''); clockInput.setCustomValidity('');
            setAnswers(current.sides.map(id => current.answers[id]));
            rememberCustomDraft();
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
