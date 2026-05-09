(function () {
    'use strict';

    var STORAGE_KEY = 'studyMode';

    function isStudyMode() {
        return document.body.classList.contains('study-mode');
    }

    function applyFromStorage() {
        try {
            if (!document.body) return;
            if (localStorage.getItem(STORAGE_KEY) === '1') {
                document.body.classList.add('study-mode');
            }
        } catch (e) {}
    }

    function persist(on) {
        try {
            localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch (e) {}
    }

    function setPressed(btn, on) {
        if (!btn) return;
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.textContent = on ? 'Обычный вид' : 'Режим заучивания';
        btn.title = on
            ? 'Вернуть навигацию и оформление сайта'
            : 'Только текст и формулы, без лишнего оформления (Alt+Z)';
    }

    function focusInEditable() {
        var el = document.activeElement;
        if (!el) return false;
        var tag = el.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if (el.isContentEditable) return true;
        return false;
    }

    applyFromStorage();

    document.addEventListener('DOMContentLoaded', function () {
        var existing = document.querySelector('.study-mode-toggle');
        if (existing) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'study-mode-toggle';
        btn.setAttribute('aria-label', 'Переключить режим заучивания');
        document.body.appendChild(btn);
        setPressed(btn, isStudyMode());

        btn.addEventListener('click', function () {
            var next = !document.body.classList.contains('study-mode');
            document.body.classList.toggle('study-mode', next);
            persist(next);
            setPressed(btn, next);
        });
    });

    document.addEventListener('keydown', function (e) {
        if (!e.altKey || e.key !== 'z' && e.key !== 'Z' && e.code !== 'KeyZ') return;
        if (e.ctrlKey || e.metaKey) return;
        if (focusInEditable()) return;
        e.preventDefault();
        var next = !document.body.classList.contains('study-mode');
        document.body.classList.toggle('study-mode', next);
        persist(next);
        var btn = document.querySelector('.study-mode-toggle');
        setPressed(btn, next);
    });
})();
