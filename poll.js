// ============================================
// ОПРОС: НОВЫЙ ДИЗАЙН (до 31.03.2026 12:00)
// ============================================

(function () {
    'use strict';

    const DEADLINE     = new Date('2026-03-29T00:00:00'); // опрос завершён
    const POLL_KEY     = 'almanion_poll_design_slate';
    const VISITOR_KEY  = 'almanion_visitor_id';
    const DELAY_MS     = 60 * 1000; // показываем через 1 минуту
    const DB_URL       = 'https://almanion-70120-default-rtdb.europe-west1.firebasedatabase.app/';
    const POLL_ID      = 'design-slate-2026';

    // Прошёл ли дедлайн?
    if (Date.now() > DEADLINE.getTime()) return;

    // Уже голосовал?
    if (localStorage.getItem(POLL_KEY)) return;

    // Запускаем таймер
    let pollTimer = setTimeout(tryShow, DELAY_MS);

    // Если пользователь уходит раньше — не показываем
    function tryShow() {
        if (localStorage.getItem(POLL_KEY)) return;
        showPoll();
    }

    // ============================================
    // ID посетителя (тот же, что в firebase-analytics)
    // ============================================
    function getVisitorId() {
        let id = localStorage.getItem(VISITOR_KEY);
        if (!id) {
            id = 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
            localStorage.setItem(VISITOR_KEY, id);
        }
        return id;
    }

    // ============================================
    // ПОКАЗ МОДАЛКИ
    // ============================================
    function showPoll() {
        if (document.getElementById('designPollOverlay')) return;

        const overlay = document.createElement('div');
        overlay.id        = 'designPollOverlay';
        overlay.className = 'poll-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Опрос о новом дизайне');

        overlay.innerHTML = buildHTML();
        document.body.appendChild(overlay);

        // Анимация появления
        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.classList.add('poll-visible');
        }));

        bindEvents(overlay);
    }

    function buildHTML() {
        const stars = [1, 2, 3, 4, 5].map(n =>
            `<button class="poll-star" data-value="${n}" aria-label="${n} из 5" title="${starLabel(n)}">★</button>`
        ).join('');

        return `
        <div class="poll-modal" id="designPollModal">
            <button class="poll-close" id="pollClose" aria-label="Закрыть">✕</button>
            <div class="poll-body">
                <p class="poll-emoji">🎨</p>
                <h3 class="poll-title">Как вам новый дизайн?</h3>
                <p class="poll-sub">Сделал редизайн — стало лучше?</p>
                <div class="poll-stars" id="pollStars" role="group" aria-label="Оценка от 1 до 5">
                    ${stars}
                </div>
                <p class="poll-hint" id="pollHint">Нажми на звёздочку</p>
                <p class="poll-deadline">Опрос активен до 31 марта</p>
            </div>
        </div>`;
    }

    function starLabel(n) {
        return ['', 'Совсем не нравится', 'Плохо', 'Нормально', 'Хорошо', 'Отлично!'][n];
    }

    // ============================================
    // СОБЫТИЯ
    // ============================================
    function bindEvents(overlay) {
        // Закрытие
        document.getElementById('pollClose')
            .addEventListener('click', closePoll);
        overlay.addEventListener('click', e => {
            if (e.target === overlay) closePoll();
        });

        // Звёзды
        const stars = overlay.querySelectorAll('.poll-star');
        const hint  = overlay.querySelector('#pollHint');
        const labels = ['', 'Совсем не нравится 😞', 'Плохо 😕', 'Нормально 😐', 'Хорошо 🙂', 'Отлично! 🤩'];

        stars.forEach(star => {
            const val = parseInt(star.dataset.value);

            star.addEventListener('mouseenter', () => {
                highlightStars(stars, val);
                if (hint) hint.textContent = labels[val];
            });
            star.addEventListener('mouseleave', () => {
                highlightStars(stars, 0);
                if (hint) hint.textContent = 'Нажмите на звёздочку';
            });
            star.addEventListener('click', () => submitRating(val));
            star.addEventListener('touchend', e => {
                e.preventDefault();
                submitRating(val);
            }, { passive: false });
        });
    }

    function highlightStars(stars, value) {
        stars.forEach(s => {
            const v = parseInt(s.dataset.value);
            s.classList.toggle('poll-star-lit', v <= value);
        });
    }

    // ============================================
    // ЗАКРЫТИЕ
    // ============================================
    function closePoll() {
        const overlay = document.getElementById('designPollOverlay');
        if (!overlay) return;
        overlay.classList.remove('poll-visible');
        setTimeout(() => overlay.remove(), 300);
    }

    // ============================================
    // ОТПРАВКА ОЦЕНКИ
    // ============================================
    function submitRating(value) {
        // Запоминаем, чтобы не показывать снова
        localStorage.setItem(POLL_KEY, JSON.stringify({
            rating: value,
            ts:     Date.now(),
            page:   location.pathname
        }));

        // Показываем благодарность
        const modal = document.getElementById('designPollModal');
        if (modal) {
            modal.innerHTML = `
                <div class="poll-thanks">
                    <p class="poll-thanks-emoji">${['','😞','😕','😐','🙂','🤩'][value]}</p>
                    <h3>Спасибо!</h3>
                    <p>Твоя оценка: <strong>${value}/5</strong></p>
                    <button class="poll-thanks-btn" id="pollThanksClose">Закрыть</button>
                </div>`;
            document.getElementById('pollThanksClose')
                .addEventListener('click', closePoll);
        }

        // Отправляем в Firebase через REST API
        saveToFirebase(value);
    }

    function saveToFirebase(value) {
        const visitorId = getVisitorId();
        const url = `${DB_URL}pollResponses/${POLL_ID}/${visitorId}.json`;

        try {
            fetch(url, {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rating: value,
                    page:   location.pathname,
                    ts:     Date.now(),
                    ua:     navigator.userAgent.slice(0, 80)
                })
            });
        } catch (_) {
            // Игнорируем ошибки сети — оценка уже в localStorage
        }
    }
})();
