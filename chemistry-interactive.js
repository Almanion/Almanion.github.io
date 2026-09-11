(function () {
    'use strict';

    function initializeChemistryReference() {
        const root = document.getElementById('oxide-interactive-hub');
        if (!root || root.dataset.interactiveReady === 'true') return;
        root.dataset.interactiveReady = 'true';

        function setHubMode(mode) {
            const isGuide = mode === 'guide';
            root.querySelectorAll('[data-chem-hub]').forEach(button => {
                const active = button.dataset.chemHub === mode;
                button.classList.toggle('is-active', active);
                button.setAttribute('aria-selected', String(active));
            });
            const guide = document.getElementById('chem-hub-pane-guide');
            const reactions = document.getElementById('chem-hub-pane-react');
            if (guide) {
                guide.classList.toggle('is-active', isGuide);
                guide.hidden = !isGuide;
            }
            if (reactions) {
                reactions.classList.toggle('is-active', !isGuide);
                reactions.hidden = isGuide;
            }
        }

        function selectReaction(id) {
            root.querySelectorAll('[data-chem-react]').forEach(button => {
                const active = button.dataset.chemReact === id;
                button.classList.toggle('active', active);
                button.setAttribute('aria-selected', String(active));
            });
            root.querySelectorAll('.chem-react-panel').forEach(panel => {
                const active = panel.id === 'chem-react-' + id;
                panel.classList.toggle('active', active);
                panel.hidden = !active;
            });
        }

        root.addEventListener('click', event => {
            const hubButton = event.target.closest('[data-chem-hub]');
            if (hubButton && root.contains(hubButton)) {
                setHubMode(hubButton.dataset.chemHub);
                return;
            }

            const reactionButton = event.target.closest('[data-chem-react]');
            if (reactionButton && root.contains(reactionButton)) {
                selectReaction(reactionButton.dataset.chemReact);
                return;
            }

            const shortcut = event.target.closest('[data-chem-scroll-to-oxide-reactions]');
            if (!shortcut || !root.contains(shortcut)) return;
            setHubMode('react');
            selectReaction('oxides');
            const anchor = document.getElementById('oxide-interactive') || root;
            anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeChemistryReference, { once: true });
    } else {
        initializeChemistryReference();
    }
})();
