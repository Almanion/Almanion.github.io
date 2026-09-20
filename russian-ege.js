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
        grid.dataset.ready = 'true';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', buildAllStressWords, { once: true });
    } else {
        buildAllStressWords();
    }

    window.AlmanionRussianEge = Object.freeze({ buildAllStressWords });
})();
