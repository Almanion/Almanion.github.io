(function () {
    'use strict';

    var tabs = Array.from(document.querySelectorAll('.grade-tab'));
    var panels = Array.from(document.querySelectorAll('.grade-panel'));
    var tabList = document.querySelector('.grade-tabs');
    var extraSection = document.querySelector('.extra-section');
    var extraAnimation = null;
    var initialEntranceTimer = 0;
    var currentGrade = '';

    function readSettings() {
        try { return JSON.parse(localStorage.getItem('siteSettings') || '{}') || {}; }
        catch (_) { return {}; }
    }

    function motionAllowed() {
        if (readSettings().animationLevel === 'off') return false;
        return !(typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    function panelFor(grade) {
        return panels.find(function (panel) { return panel.dataset.gradePanel === grade; }) || null;
    }

    function finishInitialEntrance() {
        if (initialEntranceTimer) window.clearTimeout(initialEntranceTimer);
        initialEntranceTimer = 0;
        document.body.classList.remove('home-motion-initial');
    }

    function glideExtraSection(previousTop) {
        if (!extraSection || !motionAllowed() || typeof extraSection.animate !== 'function') return;
        var nextTop = extraSection.getBoundingClientRect().top;
        var delta = previousTop - nextTop;
        if (Math.abs(delta) < 1) return;
        var animation = extraSection.animate([
            { transform: 'translateY(' + delta + 'px)' },
            { transform: 'translateY(0)' }
        ], {
            duration: document.body.classList.contains('animations-medium') ? 160 : 230,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
        });
        extraAnimation = animation;
        animation.addEventListener('finish', function () {
            if (extraAnimation === animation) extraAnimation = null;
        }, { once: true });
        animation.addEventListener('cancel', function () {
            if (extraAnimation === animation) extraAnimation = null;
        }, { once: true });
    }

    function selectGrade(grade, options) {
        var target = panelFor(grade);
        if (!target) return;
        var settings = options || {};
        if (settings.animate) finishInitialEntrance();
        if (grade === currentGrade) return;
        var oldNumber = Number(currentGrade || grade);
        var newNumber = Number(grade);
        var direction = newNumber < oldNumber ? 'prev' : 'next';
        if (extraAnimation) {
            extraAnimation.cancel();
            extraAnimation = null;
        }
        var previousTop = extraSection ? extraSection.getBoundingClientRect().top : 0;

        tabs.forEach(function (tab) {
            var active = tab.dataset.grade === grade;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', active ? 'true' : 'false');
            tab.tabIndex = active ? 0 : -1;
        });

        panels.forEach(function (panel) {
            panel.classList.remove('home-grade-enter-next', 'home-grade-enter-prev');
            panel.hidden = panel !== target;
        });

        if (tabList) tabList.dataset.activeGrade = grade;
        if (settings.animate && grade !== currentGrade && motionAllowed()) {
            target.classList.add(direction === 'prev' ? 'home-grade-enter-prev' : 'home-grade-enter-next');
            glideExtraSection(previousTop);
        }

        currentGrade = grade;
        try { localStorage.setItem('homeGrade', grade); } catch (_) { /* storage may be unavailable */ }
    }

    function moveTab(from, offset) {
        var index = tabs.indexOf(from);
        if (index < 0) return;
        var next = tabs[(index + offset + tabs.length) % tabs.length];
        next.focus();
        selectGrade(next.dataset.grade, { animate: true });
    }

    tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            selectGrade(tab.dataset.grade, { animate: true });
        });
        tab.addEventListener('keydown', function (event) {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                moveTab(tab, -1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                moveTab(tab, 1);
            } else if (event.key === 'Home') {
                event.preventDefault();
                tabs[0].focus();
                selectGrade(tabs[0].dataset.grade, { animate: true });
            } else if (event.key === 'End') {
                event.preventDefault();
                tabs[tabs.length - 1].focus();
                selectGrade(tabs[tabs.length - 1].dataset.grade, { animate: true });
            }
        });
    });

    var savedGrade = '';
    try { savedGrade = localStorage.getItem('homeGrade') || ''; } catch (_) { /* ignore */ }
    selectGrade(panelFor(savedGrade) ? savedGrade : '10', { animate: false });
    window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
            if (tabList) tabList.classList.add('home-tabs-ready');
        });
    });
    initialEntranceTimer = window.setTimeout(finishInitialEntrance, 650);
}());
