/* Keep proportional prose within the requested character count at desktop sizes. */
(() => {
    'use strict';
    const desktop = matchMedia('screen and (min-width: 1051px)');
    const main = document.querySelector('.main-content');
    if (!main || !window.IntersectionObserver) return;
    const limit = 80;
    const candidates = 'p, li, blockquote';
    const wideContent = 'p, li, blockquote, table, figure, img, svg, pre, .katex-display, .formula-display';
    const visible = new Set();
    const sizes = new WeakMap();

    function measure(el) {
        if (!desktop.matches || !el.offsetWidth) return;
        const key = el.parentElement.clientWidth + '/' + getComputedStyle(el).fontSize;
        if (sizes.get(el) === key) return;
        sizes.set(el, key);
        el.style.removeProperty('--prose-width');
        const chars = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let text; (text = walker.nextNode());) {
            if (text.parentElement.closest('button, .katex, [aria-hidden="true"]')) continue;
            for (let i = 0; i < text.length; i++) {
                const space = /\s/.test(text.data[i]);
                if (!space || (chars.length && !chars.at(-1).space)) chars.push({ text, i, space });
            }
        }
        if (chars.length <= limit) return;
        const range = document.createRange();
        function rect(index) {
            const { text, i } = chars[index];
            range.setStart(text, i);
            range.setEnd(text, i + 1);
            return range.getBoundingClientRect();
        }
        // Probe the 81st character of each rendered line. Only overlong lines need a new width.
        for (let start = 0; start + limit < chars.length;) {
            const first = rect(start);
            const sameLine = index => {
                const r = rect(index);
                return r.top < first.bottom - 1 && r.bottom > first.top + 1;
            };
            const last = start + limit;
            const over = chars[last].space ? last + 1 : last;
            if (over < chars.length && sameLine(over)) {
                const width = parseFloat(getComputedStyle(el).width);
                if (width <= 80) return;
                const reduced = Math.floor(width * .95) + 'px';
                if (el.style.getPropertyValue('--prose-width') === reduced) return;
                el.style.setProperty('--prose-width', reduced);
                start = 0;
                continue;
            }
            let low = start + 1, high = start + limit + 1;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (sameLine(mid)) low = mid + 1;
                else high = mid;
            }
            start = low;
            while (chars[start]?.space) start++;
        }
    }
    const observer = new IntersectionObserver(entries => {
        for (const { target, isIntersecting } of entries) {
            if (isIntersecting) { visible.add(target); measure(target); }
            else visible.delete(target);
        }
    }, { rootMargin: '100% 0px' });
    function observe(root) {
        root.querySelectorAll(candidates).forEach(el => {
            if (el.textContent.length > limit && !el.closest('table, figure, pre') && !el.querySelector(wideContent)) observer.observe(el);
        });
    }
    const refresh = () => { for (const el of visible) { sizes.delete(el); measure(el); } };
    let width;
    new ResizeObserver(() => {
        if (width !== main.clientWidth) { width = main.clientWidth; refresh(); }
    }).observe(main);
    desktop.addEventListener('change', refresh);
    document.fonts?.ready.then(refresh);
    window.addEventListener('almanion:content-ready', event => observe(event.detail?.root || main));
    window.addEventListener('almanion:topic-visible', event => observe(event.detail.topic));
    window.addEventListener('experimental-mode-changed', () => { observe(main.querySelector('.exp-reader-current') || main); refresh(); });
    observe(main.querySelector('.exp-reader-current') || main);
})();
