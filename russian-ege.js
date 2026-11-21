(function () {
    'use strict';

    function numericStressId(card) {
        const match = String(card.id || '').match(/stress-(\d+)/);
        return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
    }

    function createAllStressTopic(section) {
        let topic = document.getElementById('stress-all');
        if (!topic) {
            topic = document.createElement('article');
            topic.id = 'stress-all';
            topic.className = 'topic russian-stress-topic russian-stress-all';
            topic.dataset.stressKind = 'all';
            topic.innerHTML = '<h3 class="topic-title">Все</h3><div class="accent-word-grid" data-stress-all-grid></div>';

            const heading = section.querySelector('.part-title');
            if (heading) heading.insertAdjacentElement('afterend', topic);
            else section.prepend(topic);
        }
        topic.dataset.kcIgnore = 'true';
        return topic;
    }

    function addAlphabet(grid) {
        const initials = new Map();
        for (const card of grid.children) {
            const letter = card.dataset.searchWord?.charAt(0).toLocaleUpperCase('ru');
            if (letter && !initials.has(letter)) initials.set(letter, card);
        }
        if (!initials.size) return;
        const label = document.createElement('label');
        label.className = 'stress-alphabet';
        label.dataset.printExclude = 'true';
        label.append('А–Я');
        const list = document.createElement('select');
        list.setAttribute('aria-label', 'Перейти к словам на букву');
        list.add(new Option('Выбрать букву', ''));
        for (const letter of [...initials.keys()].sort((a, b) => a.localeCompare(b, 'ru'))) {
            initials.get(letter).querySelector('.accent-word').id = 'stress-all-letter-' + letter.toLocaleLowerCase('ru');
            list.add(new Option(letter, letter));
        }
        list.addEventListener('change', () => {
            const target = initials.get(list.value);
            if (!target) return;
            const anchor = target.querySelector('.accent-word');
            const url = new URL(location.href);
            url.hash = anchor.id;
            history.replaceState(history.state, '', url);
            target.tabIndex = -1;
            target.focus({ preventScroll: true });
            const inset = (parseFloat(getComputedStyle(label).top) || 0) + label.getBoundingClientRect().height + 8;
            window.scrollBy({ top: target.getBoundingClientRect().top - inset, behavior: 'instant' });
            list.selectedIndex = 0;
        });
        label.append(list);
        grid.before(label);
        requestAnimationFrame(() => {
            const controls = document.querySelector('.note-reader-controls');
            if (!controls) return;
            const place = () => {
                const css = getComputedStyle(controls);
                const top = css.position === 'sticky' ? controls.getBoundingClientRect().height + (parseFloat(css.top) || 0) : 0;
                label.style.setProperty('--alphabet-top', top + 'px');
            };
            place();
            if ('ResizeObserver' in window) new ResizeObserver(place).observe(controls);
            window.addEventListener('experimental-mode-changed', place);
        });
    }

    function buildAllStressWords() {
        const section = document.querySelector('.russian-stress-section');
        if (!section) return;

        const topic = createAllStressTopic(section);
        const grid = topic.querySelector('[data-stress-all-grid]');
        if (!grid || grid.dataset.ready === 'true') return;

        const sourceCards = Array.from(section.querySelectorAll('.russian-stress-topic:not(#stress-all) .accent-word-card[id]'))
            .sort((left, right) => numericStressId(left) - numericStressId(right));
        const fragment = document.createDocumentFragment();

        sourceCards.forEach(source => {
            const clone = source.cloneNode(true);
            clone.removeAttribute('id');
            clone.dataset.stressClone = 'true';
            clone.dataset.sourceId = source.id;
            fragment.appendChild(clone);
        });

        grid.replaceChildren(fragment);
        addAlphabet(grid);
        grid.dataset.ready = 'true';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildAllStressWords, { once: true });
    } else {
        buildAllStressWords();
    }

    window.AlmanionRussianEge = Object.freeze({ buildAllStressWords });
})();
