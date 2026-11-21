(function () {
    'use strict';

    const state = {
        active: false,
        index: 0,
        topics: [],
        sections: [],
        anchor: null,
        toolbar: null,
        controls: null,
        footer: null,
        rapidTimer: 0,
        lastNavigationAt: -Infinity,
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
        if (location.pathname.split('/').pop() === 'likbez.html') buildCourseSwitcher();
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
                <div class="exp-reader-progress" role="progressbar" aria-label="Прогресс по подразделам текущего раздела" aria-valuemin="1">
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
        const controls = document.createElement('div');
        controls.className = 'note-reader-controls';
        controls.appendChild(toolbar);
        const filter = main.querySelector(':scope > .note-filter');
        if (filter) controls.appendChild(filter);
        main.insertBefore(controls, state.sections[0]);
        const pageFooter = main.querySelector(':scope > .page-footer');
        main.insertBefore(footer, pageFooter || null);

        state.anchor = anchor;
        state.toolbar = toolbar;
        state.controls = controls;
        state.footer = footer;
    }

    function buildCourseSwitcher() {
        const label = document.createElement('label');
        label.className = 'reader-course-switch';
        label.dataset.printExclude = 'true';
        label.append('Курс');
        const select = document.createElement('select');
        select.setAttribute('aria-label', 'Курс ликбеза');
        const firstTopics = state.sections.map(section => section.querySelector(':scope > .topic[id]'));
        firstTopics.forEach(topic => select.add(new Option(getPartTitle(topic).replace(/^\d+\.\s*/, ''), topic.id)));
        select.addEventListener('change', () => {
            const topic = document.getElementById(select.value);
            if (!topic) return;
            if (location.hash !== '#' + topic.id) location.hash = topic.id;
            else if (state.active) goToId(topic.id);
            else topic.scrollIntoView();
        });
        label.append(select);
        state.anchor.before(label);
        state.courseSelect = select;
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(entries => {
                if (state.active) return;
                for (const entry of entries) {
                    if (entry.isIntersecting) select.selectedIndex = state.sections.indexOf(entry.target);
                }
            }, { rootMargin: '0px 0px -70% 0px' });
            state.sections.forEach(section => observer.observe(section));
        }
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
        bindBottomPull(main);
    }

    function createPullPreview(main) {
        const preview = document.createElement('div');
        preview.className = 'reader-pull-preview';
        preview.hidden = true;
        preview.setAttribute('aria-hidden', 'true'); // The next button already names the destination.
        preview.dataset.printExclude = 'true';
        const title = document.createElement('strong');
        preview.append(title);
        state.footer.after(preview);

        let origin = 0;
        let travel = 0;
        let topic = null;
        let closeTimer;

        function hide() {
            if (!topic) return;
            window.clearTimeout(closeTimer);
            preview.hidden = true;
            preview.removeAttribute('style');
            main.classList.remove('reader-pulling', 'reader-pull-motion', 'reader-pull-returning');
            topic.style.removeProperty('--pull-stretch');
            topic = null;
        }

        function open() {
            hide();
            const page = document.scrollingElement;
            origin = Math.min(page.scrollTop, page.scrollHeight - page.clientHeight);
            title.textContent = getTopicTitle(state.topics[state.index + 1]);
            topic = state.topics[state.index];
            preview.hidden = false;
            main.classList.add('reader-pulling');
            main.classList.toggle('reader-pull-motion', document.documentElement.dataset.pageMotion !== 'off'
                && !document.body.classList.contains('animations-off'));
            // Start the reveal at the viewport edge even when the entire topic fits on a tablet.
            const inset = parseFloat(getComputedStyle(main).paddingBottom) || 0;
            const space = Math.max(0, page.clientHeight - inset - preview.getBoundingClientRect().top);
            preview.style.setProperty('--pull-space', space + 'px');
            travel = Math.max(76, title.offsetHeight + 18);
        }

        function draw(progress) {
            if (!topic || main.classList.contains('reader-pull-returning')) open();
            // Resistance increases as the pull approaches the threshold.
            const distance = Math.round(travel * progress * (1.4 - 0.4 * progress));
            preview.style.setProperty('--pull-distance', distance + 'px');
            preview.style.setProperty('--pull-progress', progress);
            topic.style.setProperty('--pull-stretch', 1 + 0.014 * progress);
            window.scrollTo({ top: origin + distance, behavior: 'instant' });
        }

        function release() {
            if (!topic || main.classList.contains('reader-pull-returning')) return;
            main.classList.add('reader-pull-returning');
            preview.style.setProperty('--pull-distance', '0px');
            preview.style.setProperty('--pull-progress', '0');
            topic.style.removeProperty('--pull-stretch');
            // Collapsing the scroll range returns the page to its original position.
            closeTimer = window.setTimeout(hide, 210);
        }
        return { draw, release, hide };
    }

    function bindBottomPull(main) {
        const threshold = 100;
        const wheelPause = 240;
        const preview = createPullPreview(main);
        let touch = null;
        let consumeTouch = false;
        let wheelDistance = 0;
        let lastWheel = -Infinity;
        let wheelMode = 'scroll';
        let wheelTimer;

        function atBottom() {
            const page = document.scrollingElement;
            return page && page.scrollHeight - page.scrollTop - page.clientHeight <= 4;
        }

        function canPull() {
            return state.active && state.index + 1 < state.topics.length
                && (window.visualViewport?.scale || 1) <= 1.01 && !window.getSelection()?.toString()
                && !document.body.classList.contains('sidebar-open')
                && !document.querySelector('dialog[open], .note-filter[open], .auth-overlay:not(.hidden), .settings-modal:not(.hidden), .lightbox-overlay.open');
        }

        function eligibleTarget(target) {
            if (target.closest(SWIPE_BLOCK_SELECTOR) && !target.closest('.exp-reader-footer-button')) return false;
            for (let el = target; el && el !== main; el = el.parentElement) {
                if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return false;
            }
            return true;
        }

        function move(distance) {
            if (distance < threshold) {
                preview.draw(distance / threshold);
                return false;
            }
            return goToIndex(state.index + 1, { source: 'pull' });
        }

        function reset() {
            touch = null;
            wheelDistance = 0;
            wheelMode = 'scroll';
            window.clearTimeout(wheelTimer);
            preview.hide();
        }
        state.cancelPull = reset;
        for (const type of ['almanion:topic-visible', 'pagehide', 'orientationchange']) {
            window.addEventListener(type, reset);
        }

        main.addEventListener('touchstart', event => {
            main.removeEventListener('touchmove', onTouchMove);
            reset();
            consumeTouch = false;
            if (event.touches.length !== 1 || !atBottom() || !canPull() || !eligibleTarget(event.target)) return;
            const finger = event.touches[0];
            touch = { id: finger.identifier, x: finger.clientX, y: finger.clientY, pulling: false };
            main.addEventListener('touchmove', onTouchMove, { passive: false });
        }, { passive: true });

        function onTouchMove(event) {
            if (consumeTouch && event.touches.length === 1) {
                if (event.cancelable) event.preventDefault();
                return;
            }
            if (!touch) return;
            const finger = event.touches[0];
            if (event.touches.length !== 1 || finger.identifier !== touch.id || !canPull()) return reset();
            const up = touch.y - finger.clientY;
            const across = Math.abs(touch.x - finger.clientX);
            if (up < -8 || (across > 12 && across * 1.5 > up)) return reset();
            if (!touch.pulling) {
                if (up < 8) return;
                // Even a single coalesced move must reveal the title before it can turn the page.
                touch.offset = Math.max(0, up - (threshold - 20));
            }
            if (!event.cancelable) return reset();
            event.preventDefault();
            touch.pulling = true;
            consumeTouch = move(Math.max(0, up - touch.offset));
        }

        function finishTouch(event) {
            main.removeEventListener('touchmove', onTouchMove);
            if ((consumeTouch || touch?.pulling) && event.cancelable) event.preventDefault();
            if (event.type === 'touchend' && touch?.pulling && !event.touches.length && canPull()) {
                const finger = event.changedTouches[0];
                const up = touch.y - finger.clientY;
                const reached = up - touch.offset >= threshold && up > Math.abs(touch.x - finger.clientX) * 1.5;
                if (finger.identifier === touch.id && reached) move(threshold);
            }
            touch = null;
            consumeTouch = false;
            preview.release();
        }
        main.addEventListener('touchend', finishTouch, { passive: false });
        main.addEventListener('touchcancel', finishTouch, { passive: false });

        main.addEventListener('wheel', event => {
            const now = performance.now();
            if (now - lastWheel > wheelPause) wheelMode = atBottom() ? 'pull' : 'scroll';
            lastWheel = now;
            const modified = event.ctrlKey || event.shiftKey || event.altKey || event.metaKey;
            if (modified || event.deltaY <= 0 || Math.abs(event.deltaX) > event.deltaY || !event.cancelable) {
                wheelMode = 'scroll';
                if (wheelDistance) reset();
                return;
            }
            // Momentum from reaching the bottom or turning a page is still the original scroll.
            if (wheelMode === 'turned') {
                event.preventDefault();
                return;
            }
            if (wheelMode !== 'pull' || touch || !canPull()) return;
            if (!wheelDistance && (!atBottom() || !eligibleTarget(event.target))) {
                wheelMode = 'scroll';
                return;
            }
            event.preventDefault();
            const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
            wheelDistance += Math.min(event.deltaY * unit, threshold / 2);
            window.clearTimeout(wheelTimer);
            if (move(wheelDistance)) {
                wheelMode = 'turned';
                lastWheel = performance.now();
            } else {
                wheelTimer = window.setTimeout(() => {
                    wheelDistance = 0;
                    preview.release();
                }, 800);
            }
        }, { passive: false });
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
        const hashTarget = document.getElementById(hashId);
        const hashIndex = state.topics.indexOf(hashTarget?.closest('.topic'));
        state.index = hashIndex >= 0 ? hashIndex : 0;
        applyTopicVisibility();
        prepareTopic(state.topics[state.index]);
        updateReaderUi();

        if (hashIndex >= 0) goToId(hashId, { animate: false, updateHash: false });
    }

    function deactivateReader() {
        window.clearTimeout(state.rapidTimer);
        state.rapidTimer = 0;
        cancelSwipe();
        state.cancelPull();
        state.active = false;
        state.toolbar.hidden = true;
        state.footer.hidden = true;
        document.body.classList.remove(
            'exp-reader-active',
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
                'exp-reader-dragging'
            );
            topic.style.removeProperty('--exp-reader-drag-x');
            topic.style.removeProperty('--exp-reader-drag-opacity');
            topic.removeAttribute('aria-hidden');
            setElementInert(topic, false);
        });
    }

    function goToId(id, options) {
        const target = document.getElementById(id);
        const index = state.topics.indexOf(target?.closest('.topic'));
        if (index < 0) return false;
        const settings = { scroll: true, updateHash: true, ...(options || {}) };
        const nested = target !== state.topics[index];
        if (!goToIndex(index, { ...settings, scroll: nested ? false : settings.scroll, updateHash: nested ? false : settings.updateHash })) return false;
        if (nested && settings.updateHash) {
            const url = new URL(window.location.href);
            url.hash = id;
            window.history.replaceState(window.history.state, '', url);
        }
        if (nested && settings.scroll) {
            const offset = state.controls.getBoundingClientRect().height + 16;
            window.scrollTo({ top: Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset), behavior: 'auto' });
        }
        return true;
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
        const entrance = settings.source === 'pull' ? 'scroll' : direction;
        const now = performance.now();
        const rapid = !!settings.rapid
            || now - state.lastNavigationAt < 150;
        state.lastNavigationAt = now;

        setRapidNavigationState(rapid);
        const readerScrollTop = settings.scroll ? getReaderScrollTop() : null;
        const step = ['keyboard', 'controls', 'swipe', 'pull'].includes(settings.source);
        state.index = nextIndex;
        applyTopicVisibility(previousIndex);
        prepareTopic(state.topics[nextIndex], settings.animate && step && !rapid ? entrance : null);
        updateReaderUi();
        if (settings.updateHash) updateLocationHash();
        if (readerScrollTop !== null) scrollToReader(readerScrollTop);
        return true;
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

    function applyTopicVisibility(previousIndex) {
        const currentTopic = state.topics[state.index];
        const currentSection = currentTopic.closest('.content-section');

        // Update previous/current elements; activation needs a full pass.
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

    function prepareTopic(topic, entrance = null) {
        if (!topic) return;
        if (window.AlmanionMath) window.AlmanionMath.render(topic);
        window.dispatchEvent(new CustomEvent('almanion:topic-visible', {
            detail: { topic, entrance }
        }));

        // Warm only the adjacent topic; keep the initial page render lazy.
        const next = state.topics[state.index + 1];
        if (!next || !window.AlmanionMath) return;
        const warm = () => window.AlmanionMath?.render(next);
        if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 1200 });
        else window.setTimeout(warm, 160);
    }

    function updateReaderUi() {
        const current = state.topics[state.index];
        if (state.courseSelect) state.courseSelect.selectedIndex = state.sections.indexOf(current.parentElement);
        const part = getPartTitle(current);
        const sectionTopics = state.topics.filter(topic => topic.parentElement === current.parentElement);
        const currentNumber = sectionTopics.indexOf(current) + 1;
        const total = sectionTopics.length;
        const percent = `${(currentNumber / total) * 100}%`;
        const atEnd = state.index === state.topics.length - 1;

        document.body.classList.toggle('exp-reader-at-start', state.index === 0);
        document.body.classList.toggle('exp-reader-at-end', atEnd);

        state.toolbar.querySelector('.exp-reader-part').textContent = part;
        state.toolbar.querySelector('.exp-reader-count').textContent = `${currentNumber} / ${total}`;

        const progress = state.toolbar.querySelector('.exp-reader-progress');
        progress.setAttribute('aria-valuemax', String(total));
        progress.setAttribute('aria-valuenow', String(currentNumber));
        progress.setAttribute('aria-valuetext', `Подраздел ${currentNumber} из ${total}`);
        progress.querySelector('span').style.width = percent;

        updateControlState(state.toolbar, 'prev', state.index === 0);
        updateControlState(state.toolbar, 'next', atEnd);
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
        const stickyOffset = Number.parseFloat(window.getComputedStyle(state.controls || state.toolbar).top) || 0;
        return Math.max(0, Math.round(anchorTop - stickyOffset));
    }

    function scrollToReader(targetTop) {
        const y = Number.isFinite(targetTop) ? targetTop : getReaderScrollTop();
        window.scrollTo({ top: y, behavior: 'auto' });
    }

    function onPointerDown(event) {
        if (!state.active || state.swipe || !event.isPrimary || event.button !== 0) return;
        // Перелистывание жестом предназначено только для сенсорных экранов.
        // Перетаскивание мышью на компьютере должно оставаться обычным
        // выделением текста для копирования.
        if (event.pointerType !== 'touch') return;
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
        if (window.getSelection()?.toString().trim()) { cancelSwipe(); return; }
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
        const isLongEnough = Math.abs(swipe.deltaX) >= 56;
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
