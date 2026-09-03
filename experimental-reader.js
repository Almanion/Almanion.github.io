(function () {
    'use strict';

    const state = {
        active: false,
        animating: false,
        index: 0,
        topics: [],
        sections: [],
        anchor: null,
        toolbar: null,
        footer: null,
        enterTimer: 0,
        rapidTimer: 0,
        transitionGeneration: 0,
        transitionAnimation: null,
        animatedTopic: null,
        lastNavigationAt: 0,
        sidebarLinks: new Map(),
        activeSidebarLink: null,
        swipe: null
    };

    const ICON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
    const ICON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';
    const SWIPE_BLOCK_SELECTOR = 'a, button, input, textarea, select, option, label, [contenteditable="true"], img, table, pre, code, .katex-display, .chem-table-wrap, .table-wrapper, [data-no-reader-swipe]';

    function initExperimentalReader() {
        const main = document.querySelector('.main-content');
        if (!main || document.body.classList.contains('matcenter-page')) return;

        state.topics = Array.from(main.querySelectorAll('.content-section > .topic[id]'));
        if (state.topics.length < 2) return;

        state.sections = Array.from(new Set(state.topics.map(topic => topic.closest('.content-section'))));
        document.querySelectorAll('.nav-link[href^="#"]').forEach(link => {
            const id = decodeURIComponent(link.getAttribute('href').slice(1));
            if (id) state.sidebarLinks.set(id, link);
        });
        buildReaderUi(main);
        bindReaderEvents(main);

        window.experimentalReader = {
            isActive: () => state.active,
            goToId,
            revealElement
        };

        syncExperimentalReader();
    }

    function buildReaderUi(main) {
        const anchor = document.createElement('span');
        anchor.className = 'exp-reader-anchor';
        anchor.setAttribute('aria-hidden', 'true');

        const toolbar = document.createElement('nav');
        toolbar.className = 'exp-reader-toolbar';
        toolbar.hidden = true;
        toolbar.setAttribute('aria-label', 'Навигация по разделам конспекта');
        toolbar.innerHTML = `
            <button class="exp-reader-arrow" type="button" data-reader-action="prev" aria-label="Предыдущий раздел">
                ${ICON_LEFT}
            </button>
            <div class="exp-reader-status" aria-live="polite">
                <div class="exp-reader-status-line">
                    <span class="exp-reader-part"></span>
                    <span class="exp-reader-count"></span>
                </div>
                <div class="exp-reader-progress" role="progressbar" aria-label="Прогресс по разделам" aria-valuemin="1">
                    <span></span>
                </div>
            </div>
            <button class="exp-reader-arrow" type="button" data-reader-action="next" aria-label="Следующий раздел">
                ${ICON_RIGHT}
            </button>`;

        const footer = document.createElement('nav');
        footer.className = 'exp-reader-footer';
        footer.hidden = true;
        footer.setAttribute('aria-label', 'Переход между разделами конспекта');
        footer.innerHTML = `
            <button class="exp-reader-footer-button exp-reader-footer-prev" type="button" data-reader-action="prev">
                ${ICON_LEFT}
                <span><small>Назад</small><strong></strong></span>
            </button>
            <button class="exp-reader-footer-button exp-reader-footer-next" type="button" data-reader-action="next">
                <span><small>Далее</small><strong></strong></span>
                ${ICON_RIGHT}
            </button>`;

        main.insertBefore(anchor, state.sections[0]);
        main.insertBefore(toolbar, state.sections[0]);
        const pageFooter = main.querySelector(':scope > .page-footer');
        main.insertBefore(footer, pageFooter || null);

        state.anchor = anchor;
        state.toolbar = toolbar;
        state.footer = footer;
    }

    function bindReaderEvents(main) {
        [state.toolbar, state.footer].forEach(controls => {
            controls.addEventListener('click', event => {
                const button = event.target.closest('[data-reader-action]');
                if (!button || button.disabled) return;
                const delta = button.dataset.readerAction === 'next' ? 1 : -1;
                goToIndex(state.index + delta, { source: 'controls' });
            });
        });

        window.addEventListener('experimental-mode-changed', syncExperimentalReader);
        window.addEventListener('hashchange', () => {
            if (!state.active) return;
            goToId(decodeURIComponent(window.location.hash.slice(1)), {
                animate: false,
                scroll: true,
                updateHash: false
            });
        });

        document.addEventListener('keydown', event => {
            if (!state.active || event.altKey || event.ctrlKey || event.metaKey) return;
            if (event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
            if (document.querySelector('.settings-modal:not(.hidden), .auth-overlay:not(.hidden), .lightbox-overlay.open')) return;

            if (event.key === 'ArrowRight') {
                event.preventDefault();
                goToIndex(state.index + 1, { source: 'keyboard', rapid: event.repeat });
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                goToIndex(state.index - 1, { source: 'keyboard', rapid: event.repeat });
            }
        });

        main.addEventListener('pointerdown', onPointerDown, { passive: true });
        main.addEventListener('pointermove', onPointerMove, { passive: false });
        main.addEventListener('pointerup', onPointerEnd, { passive: true });
        main.addEventListener('pointercancel', cancelSwipe, { passive: true });
    }

    function syncExperimentalReader() {
        const shouldBeActive = document.body.classList.contains('experimental');
        if (shouldBeActive && !state.active) activateReader();
        if (!shouldBeActive && state.active) deactivateReader();
    }

    function activateReader() {
        state.active = true;
        state.toolbar.hidden = false;
        state.footer.hidden = false;
        document.body.classList.add('exp-reader-active');

        const hashId = decodeURIComponent(window.location.hash.slice(1));
        const hashIndex = state.topics.findIndex(topic => topic.id === hashId);
        state.index = hashIndex >= 0 ? hashIndex : 0;
        applyTopicVisibility();
        updateReaderUi();

        if (hashIndex >= 0) scrollToReader();
    }

    function deactivateReader() {
        clearReaderTimers();
        window.clearTimeout(state.rapidTimer);
        state.rapidTimer = 0;
        if (state.transitionAnimation) {
            state.transitionAnimation.cancel();
            state.transitionAnimation = null;
        }
        state.animatedTopic = null;
        cancelSwipe();
        state.active = false;
        state.animating = false;
        state.toolbar.hidden = true;
        state.footer.hidden = true;
        document.body.classList.remove(
            'exp-reader-active',
            'exp-reader-transitioning',
            'exp-reader-rapid',
            'exp-reader-at-start',
            'exp-reader-at-end'
        );

        state.sections.forEach(section => {
            section.classList.remove('exp-reader-section-current');
            section.removeAttribute('aria-hidden');
            setElementInert(section, false);
        });
        state.topics.forEach(topic => {
            topic.classList.remove(
                'exp-reader-current',
                'exp-reader-enter-next',
                'exp-reader-enter-prev',
                'exp-reader-leave-next',
                'exp-reader-leave-prev',
                'exp-reader-dragging'
            );
            topic.style.removeProperty('--exp-reader-drag-x');
            topic.style.removeProperty('--exp-reader-drag-opacity');
            topic.removeAttribute('aria-hidden');
            setElementInert(topic, false);
        });
    }

    function goToId(id, options) {
        const index = state.topics.findIndex(topic => topic.id === id);
        if (index < 0) return false;
        return goToIndex(index, options);
    }

    function revealElement(element, options) {
        if (!state.active || !element) return false;
        const topic = element.closest('.topic');
        if (!topic) return false;
        const index = state.topics.indexOf(topic);
        if (index < 0) return false;
        return goToIndex(index, {
            animate: false,
            scroll: false,
            updateHash: true,
            ...(options || {})
        });
    }

    function goToIndex(nextIndex, options) {
        if (!state.active) return false;
        if (nextIndex < 0 || nextIndex >= state.topics.length) return false;

        const settings = {
            animate: true,
            scroll: true,
            updateHash: true,
            ...(options || {})
        };

        if (nextIndex === state.index) {
            if (settings.scroll) scrollToReader();
            if (settings.updateHash) updateLocationHash();
            updateReaderUi();
            return true;
        }

        const previousIndex = state.index;
        const direction = nextIndex > previousIndex ? 'next' : 'prev';
        const animate = settings.animate && !prefersReducedReaderMotion();
        const now = performance.now();
        const rapid = !!settings.rapid
            || ((settings.source === 'keyboard' || settings.source === 'controls')
                && now - state.lastNavigationAt < 130);
        state.lastNavigationAt = now;

        // Состояние меняется сразу, даже если предыдущий визуальный переход ещё
        // идёт. Отменяем только одну активную animation вместо обхода всех тем.
        cancelReaderTransition();
        setRapidNavigationState(rapid);

        const readerScrollTop = settings.scroll ? getReaderScrollTop() : null;
        const commit = () => {
            state.index = nextIndex;
            applyTopicVisibility(previousIndex);
            updateReaderUi();
            if (settings.updateHash) updateLocationHash();
            if (readerScrollTop !== null) scrollToReader(readerScrollTop);
            return state.topics[state.index];
        };

        if (!animate) {
            commit();
            return true;
        }

        const generation = ++state.transitionGeneration;
        state.animating = true;
        document.body.classList.add('exp-reader-transitioning');

        const incoming = commit();
        startReaderTransition(incoming, direction, rapid, generation);
        return true;
    }

    function startReaderTransition(incoming, direction, rapid, generation) {
        const offset = direction === 'next' ? 1 : -1;
        const duration = rapid ? 72 : getReaderEnterDuration();
        state.animatedTopic = incoming;

        if (typeof incoming.animate === 'function') {
            const animation = incoming.animate([
                {
                    opacity: rapid ? 0.74 : 0.38,
                    transform: `translate3d(${offset * (rapid ? 2 : 7)}px, 0, 0)`
                },
                { opacity: 1, transform: 'translate3d(0, 0, 0)' }
            ], {
                duration,
                easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                fill: 'both'
            });
            state.transitionAnimation = animation;
            animation.finished.then(() => {
                if (generation !== state.transitionGeneration) return;
                animation.cancel();
                state.transitionAnimation = null;
                state.animatedTopic = null;
                finishReaderTransition();
            }).catch(() => {});
            return;
        }

        incoming.classList.add(`exp-reader-enter-${direction}`);
        if (rapid) incoming.classList.add('exp-reader-enter-rapid');
        state.enterTimer = window.setTimeout(() => {
            if (generation !== state.transitionGeneration) return;
            incoming.classList.remove(`exp-reader-enter-${direction}`, 'exp-reader-enter-rapid');
            state.animatedTopic = null;
            finishReaderTransition();
        }, duration);
    }

    function cancelReaderTransition() {
        state.transitionGeneration++;
        clearReaderTimers();
        if (state.transitionAnimation) {
            state.transitionAnimation.cancel();
            state.transitionAnimation = null;
        }
        if (state.animatedTopic) {
            state.animatedTopic.classList.remove(
                'exp-reader-enter-next',
                'exp-reader-enter-prev',
                'exp-reader-enter-rapid'
            );
            state.animatedTopic = null;
        }
        state.animating = false;
        document.body.classList.remove('exp-reader-transitioning');
    }

    function finishReaderTransition() {
        state.animating = false;
        document.body.classList.remove('exp-reader-transitioning');
    }

    function clearReaderTimers() {
        window.clearTimeout(state.enterTimer);
        state.enterTimer = 0;
    }

    function setRapidNavigationState(rapid) {
        window.clearTimeout(state.rapidTimer);
        if (!rapid) {
            document.body.classList.remove('exp-reader-rapid');
            state.toolbar.querySelector('.exp-reader-status').setAttribute('aria-live', 'polite');
            return;
        }

        document.body.classList.add('exp-reader-rapid');
        state.toolbar.querySelector('.exp-reader-status').setAttribute('aria-live', 'off');
        state.rapidTimer = window.setTimeout(() => {
            document.body.classList.remove('exp-reader-rapid');
            state.toolbar.querySelector('.exp-reader-status').setAttribute('aria-live', 'polite');
            state.rapidTimer = 0;
        }, 160);
    }

    function prefersReducedReaderMotion() {
        return document.body.classList.contains('animations-off')
            || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    function getReaderEnterDuration() {
        return document.body.classList.contains('animations-medium') ? 110 : 170;
    }

    function applyTopicVisibility(previousIndex) {
        const currentTopic = state.topics[state.index];
        const currentSection = currentTopic.closest('.content-section');

        // При обычном перелистывании достаточно обновить предыдущий и новый
        // элементы. Полный проход нужен только при первой активации режима.
        if (Number.isInteger(previousIndex) && previousIndex !== state.index) {
            const previousTopic = state.topics[previousIndex];
            const previousSection = previousTopic && previousTopic.closest('.content-section');

            if (previousTopic) {
                previousTopic.classList.remove('exp-reader-current');
                previousTopic.setAttribute('aria-hidden', 'true');
                setElementInert(previousTopic, true);
            }
            currentTopic.classList.add('exp-reader-current');
            currentTopic.setAttribute('aria-hidden', 'false');
            setElementInert(currentTopic, false);

            if (previousSection !== currentSection) {
                if (previousSection) {
                    previousSection.classList.remove('exp-reader-section-current');
                    previousSection.setAttribute('aria-hidden', 'true');
                    setElementInert(previousSection, true);
                }
                currentSection.classList.add('exp-reader-section-current');
                currentSection.setAttribute('aria-hidden', 'false');
                setElementInert(currentSection, false);
            }
            return;
        }

        state.sections.forEach(section => {
            const isCurrent = section === currentSection;
            section.classList.toggle('exp-reader-section-current', isCurrent);
            section.setAttribute('aria-hidden', String(!isCurrent));
            setElementInert(section, !isCurrent);
        });

        state.topics.forEach((topic, index) => {
            const isCurrent = index === state.index;
            topic.classList.toggle('exp-reader-current', isCurrent);
            topic.setAttribute('aria-hidden', String(!isCurrent));
            setElementInert(topic, !isCurrent);
        });
    }

    function setElementInert(element, inert) {
        if ('inert' in element) element.inert = inert;
    }

    function updateReaderUi() {
        const current = state.topics[state.index];
        const part = getPartTitle(current);
        const currentNumber = state.index + 1;
        const total = state.topics.length;
        const percent = `${(currentNumber / total) * 100}%`;

        document.body.classList.toggle('exp-reader-at-start', state.index === 0);
        document.body.classList.toggle('exp-reader-at-end', state.index === total - 1);

        state.toolbar.querySelector('.exp-reader-part').textContent = part;
        state.toolbar.querySelector('.exp-reader-count').textContent = `${currentNumber} / ${total}`;

        const progress = state.toolbar.querySelector('.exp-reader-progress');
        progress.setAttribute('aria-valuemax', String(total));
        progress.setAttribute('aria-valuenow', String(currentNumber));
        progress.setAttribute('aria-valuetext', `Раздел ${currentNumber} из ${total}`);
        progress.querySelector('span').style.width = percent;

        updateControlState(state.toolbar, 'prev', state.index === 0);
        updateControlState(state.toolbar, 'next', state.index === total - 1);
        updateFooterButton('prev', state.index - 1, 'Начало конспекта');
        updateFooterButton('next', state.index + 1, 'Конец конспекта');
        syncSidebarLink(current.id);
    }

    function updateControlState(container, action, disabled) {
        const button = container.querySelector(`[data-reader-action="${action}"]`);
        button.disabled = disabled;
        button.setAttribute('aria-disabled', String(disabled));
    }

    function updateFooterButton(action, targetIndex, edgeLabel) {
        const button = state.footer.querySelector(`[data-reader-action="${action}"]`);
        const valid = targetIndex >= 0 && targetIndex < state.topics.length;
        button.disabled = !valid;
        button.setAttribute('aria-disabled', String(!valid));
        button.querySelector('strong').textContent = valid
            ? getTopicTitle(state.topics[targetIndex])
            : edgeLabel;
    }

    function getPartTitle(topic) {
        const section = topic.closest('.content-section');
        if (!section) return 'Конспект';
        const title = Array.from(section.children).find(child => child.classList.contains('part-title'));
        return title ? normalizeText(title.textContent) : 'Конспект';
    }

    function getTopicTitle(topic) {
        const title = topic.querySelector('.topic-title');
        return title ? normalizeText(title.textContent) : topic.id;
    }

    function normalizeText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function syncSidebarLink(id) {
        if (state.activeSidebarLink) {
            state.activeSidebarLink.classList.remove('active');
            state.activeSidebarLink.removeAttribute('aria-current');
        }
        const nextLink = state.sidebarLinks.get(id) || null;
        if (nextLink) {
            nextLink.classList.add('active');
            nextLink.setAttribute('aria-current', 'location');
        }
        state.activeSidebarLink = nextLink;
    }

    function updateLocationHash() {
        const topic = state.topics[state.index];
        if (!topic || window.location.hash === `#${topic.id}`) return;
        const url = new URL(window.location.href);
        url.hash = topic.id;
        window.history.replaceState(window.history.state, '', url);
    }

    function getReaderScrollTop() {
        if (!state.anchor || !state.toolbar) return window.scrollY;
        const anchorTop = state.anchor.getBoundingClientRect().top + window.scrollY;
        const stickyOffset = Number.parseFloat(window.getComputedStyle(state.toolbar).top) || 0;
        return Math.max(0, Math.round(anchorTop - stickyOffset));
    }

    function scrollToReader(targetTop) {
        const y = Number.isFinite(targetTop) ? targetTop : getReaderScrollTop();
        window.scrollTo({ top: y, behavior: 'auto' });
    }

    function onPointerDown(event) {
        if (!state.active || state.swipe || !event.isPrimary || event.button !== 0) return;
        if (!event.target.closest || event.target.closest(SWIPE_BLOCK_SELECTOR)) return;
        if (document.querySelector('.settings-modal:not(.hidden), .auth-overlay:not(.hidden), .lightbox-overlay.open')) return;

        state.swipe = {
            pointerId: event.pointerId,
            pointerType: event.pointerType,
            startX: event.clientX,
            startY: event.clientY,
            deltaX: 0,
            deltaY: 0,
            horizontal: false,
            cancelled: false
        };
    }

    function onPointerMove(event) {
        if (!state.swipe || state.swipe.cancelled || event.pointerId !== state.swipe.pointerId) return;
        const deltaX = event.clientX - state.swipe.startX;
        const deltaY = event.clientY - state.swipe.startY;
        state.swipe.deltaX = deltaX;
        state.swipe.deltaY = deltaY;

        if (!state.swipe.horizontal) {
            if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10) return;
            if (Math.abs(deltaY) >= Math.abs(deltaX)) {
                state.swipe.cancelled = true;
                return;
            }
            state.swipe.horizontal = true;
            document.body.classList.add('exp-reader-pointer-active');
            event.currentTarget.setPointerCapture?.(event.pointerId);
        }

        event.preventDefault();
        const current = state.topics[state.index];
        const againstEdge = (state.index === 0 && deltaX > 0)
            || (state.index === state.topics.length - 1 && deltaX < 0);
        const distance = Math.max(-12, Math.min(12, deltaX * (againstEdge ? 0.035 : 0.075)));
        const opacity = Math.max(0.94, 1 - Math.abs(deltaX) / 1400);
        current.classList.add('exp-reader-dragging');
        current.style.setProperty('--exp-reader-drag-x', `${distance}px`);
        current.style.setProperty('--exp-reader-drag-opacity', String(opacity));
    }

    function onPointerEnd(event) {
        if (!state.swipe || event.pointerId !== state.swipe.pointerId) return;
        const swipe = state.swipe;
        const current = state.topics[state.index];
        current.classList.remove('exp-reader-dragging');
        current.style.removeProperty('--exp-reader-drag-x');
        current.style.removeProperty('--exp-reader-drag-opacity');
        state.swipe = null;
        document.body.classList.remove('exp-reader-pointer-active');

        if (!swipe.horizontal || swipe.cancelled) return;
        const threshold = swipe.pointerType === 'mouse' ? 72 : 56;
        const isLongEnough = Math.abs(swipe.deltaX) >= threshold;
        const isHorizontal = Math.abs(swipe.deltaX) > Math.abs(swipe.deltaY) * 1.25;
        if (!isLongEnough || !isHorizontal) return;

        const delta = swipe.deltaX < 0 ? 1 : -1;
        goToIndex(state.index + delta, { source: 'swipe' });
    }

    function cancelSwipe() {
        const current = state.topics[state.index];
        if (current) {
            current.classList.remove('exp-reader-dragging');
            current.style.removeProperty('--exp-reader-drag-x');
            current.style.removeProperty('--exp-reader-drag-opacity');
        }
        state.swipe = null;
        document.body.classList.remove('exp-reader-pointer-active');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExperimentalReader);
    } else {
        initExperimentalReader();
    }
})();
