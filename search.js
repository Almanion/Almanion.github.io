// Поиск по конспектам Almanion: один результат на тему, с ранжированием
// по заголовкам и возможностью перейти на другую страницу.
(function () {
    'use strict';

    const INDEX_VERSION = '2026-09-02-2';
    const CACHE_KEY = `almanion_search_${INDEX_VERSION}`;
    const PAGES = [
        { path: 'physics.html', label: 'Физика' },
        { path: 'chemistry.html', label: 'Химия' },
        { path: 'math.html', label: 'Алгебра' },
        { path: 'geometry.html', label: 'Геометрия' },
        { path: 'geometry-formulas.html', label: 'Формулы по геометрии' },
        { path: 'likbez.html', label: 'Ликбезы' },
        { path: 'physics-exam.html', label: 'Билеты по физике' }
    ];
    const state = {
        input: null,
        panel: null,
        list: null,
        count: null,
        scope: 'all',
        index: [],
        indexPromise: null,
        results: [],
        selected: -1,
        query: '',
        debounce: 0,
        initialized: false
    };

    function normalize(value) {
        return String(value || '')
            .toLocaleLowerCase('ru-RU')
            .replace(/ё/g, 'е')
            .replace(/[‐‑‒–—−]/g, '-')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function displayText(value) {
        return String(value || '')
            .replace(/\\(?:begin|end)\{[^}]+\}/g, ' ')
            .replace(/\\(?:left|right|displaystyle|textstyle|limits)\b/g, '')
            .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]*)\}/g, '$1')
            .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
            .replace(/\\sqrt\{([^{}]*)\}/g, '√($1)')
            .replace(/\\(?:alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega)\b/gi, ' ')
            .replace(/\\[a-zA-Z]+\*?/g, ' ')
            .replace(/[{}$]/g, '')
            .replace(/\s*[_^]\s*/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function pagePath(value) {
        try {
            const pathname = new URL(value, location.href).pathname;
            return pathname.split('/').pop() || 'index.html';
        } catch (_) {
            return String(value || '').split('/').pop();
        }
    }

    function textFromNode(node) {
        const clone = node.cloneNode(true);
        clone.querySelectorAll([
            'script', 'style', '.bookmark-btn', '.copy-block-btn', '.formula-copy-btn',
            '.toggle-derivation', '.toggle-proof', '.katex-html', '.MathJax_Preview'
        ].join(',')).forEach(item => item.remove());
        return displayText(clone.textContent);
    }

    function entriesFromDocument(doc, page) {
        let nodes = Array.from(doc.querySelectorAll('.topic[id]'));
        if (!nodes.length) nodes = Array.from(doc.querySelectorAll('.content-section[id]'));

        return nodes.map((node, order) => {
            const heading = node.querySelector('.topic-title, .part-title, h1, h2, h3');
            const title = displayText(heading?.textContent) || `Раздел ${order + 1}`;
            const text = textFromNode(node);
            return {
                page: page.path,
                subject: page.label,
                id: node.id,
                title,
                text,
                normalizedTitle: normalize(title),
                normalizedText: normalize(text)
            };
        }).filter(entry => entry.id && entry.text);
    }

    function readCache() {
        try {
            const parsed = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
            return Array.isArray(parsed) ? parsed : null;
        } catch (_) {
            return null;
        }
    }

    function writeCache(entries) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(entries)); } catch (_) {}
    }

    async function loadPage(page) {
        const current = pagePath(location.pathname);
        if (current === page.path) return entriesFromDocument(document, page);

        const response = await fetch(new URL(page.path, location.href), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return entriesFromDocument(doc, page);
    }

    function ensureIndex() {
        if (state.index.length) return Promise.resolve(state.index);
        if (state.indexPromise) return state.indexPromise;

        const cached = readCache();
        if (cached?.length) {
            state.index = cached;
            return Promise.resolve(state.index);
        }

        state.indexPromise = Promise.allSettled(PAGES.map(loadPage)).then(results => {
            state.index = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
            if (state.index.length) writeCache(state.index);
            return state.index;
        }).finally(() => {
            state.indexPromise = null;
        });
        return state.indexPromise;
    }

    function createPanel() {
        const existing = document.getElementById('searchResultsPanel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'searchResultsPanel';
        panel.className = 'search-results-panel hidden site-search-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Результаты поиска');
        panel.innerHTML = `
            <div class="search-results-head">
                <strong class="site-search-count">Поиск по конспектам</strong>
                <button type="button" class="search-results-close" aria-label="Закрыть">×</button>
            </div>
            <div class="site-search-scope" role="group" aria-label="Область поиска">
                <button type="button" class="active" data-search-scope="all" aria-pressed="true">Весь сайт</button>
                <button type="button" data-search-scope="page" aria-pressed="false">Эта страница</button>
            </div>
            <div class="search-results-list" role="listbox"></div>`;

        const box = state.input.closest('.search-box');
        (box?.parentElement || state.input.parentElement).insertBefore(panel, box?.nextSibling || state.input.nextSibling);
        state.panel = panel;
        state.list = panel.querySelector('.search-results-list');
        state.count = panel.querySelector('.site-search-count');

        panel.querySelector('.search-results-close').addEventListener('click', close);
        panel.querySelectorAll('[data-search-scope]').forEach(button => {
            button.addEventListener('click', () => {
                state.scope = button.dataset.searchScope;
                panel.querySelectorAll('[data-search-scope]').forEach(item => {
                    const active = item === button;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-pressed', String(active));
                });
                run(state.query);
            });
        });
    }

    function show() {
        state.panel?.classList.remove('hidden');
        state.input?.setAttribute('aria-expanded', 'true');
    }

    function close() {
        state.panel?.classList.add('hidden');
        state.input?.setAttribute('aria-expanded', 'false');
        state.selected = -1;
    }

    function tokensFor(query) {
        return normalize(query).split(/[^\p{L}\p{N}]+/u).filter(token => token.length > 1);
    }

    function scoreEntry(entry, tokens) {
        if (!tokens.every(token => entry.normalizedText.includes(token))) return -1;
        let score = pagePath(location.pathname) === entry.page ? 4 : 0;
        tokens.forEach(token => {
            if (entry.normalizedTitle === token) score += 120;
            else if (entry.normalizedTitle.startsWith(token)) score += 72;
            else if (entry.normalizedTitle.includes(token)) score += 44;
            else score += 4;
            const first = entry.normalizedText.indexOf(token);
            if (first >= 0) score += Math.max(0, 12 - first / 250);
        });
        return score;
    }

    function snippetFor(entry, tokens) {
        const lower = normalize(entry.text);
        let position = -1;
        tokens.forEach(token => {
            const found = lower.indexOf(token);
            if (found >= 0 && (position < 0 || found < position)) position = found;
        });
        if (position < 0) position = 0;
        const start = Math.max(0, position - 72);
        const end = Math.min(entry.text.length, position + 170);
        return `${start ? '…' : ''}${entry.text.slice(start, end).trim()}${end < entry.text.length ? '…' : ''}`;
    }

    function escapeHtml(value) {
        const span = document.createElement('span');
        span.textContent = String(value || '');
        return span.innerHTML;
    }

    function highlight(value, tokens) {
        if (!tokens.length) return escapeHtml(value);
        const pattern = tokens
            .slice()
            .sort((a, b) => b.length - a.length)
            .map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('|');
        if (!pattern) return escapeHtml(value);
        return escapeHtml(value).replace(new RegExp(`(${pattern})`, 'giu'), '<mark class="search-result-term">$1</mark>');
    }

    function render(tokens) {
        if (!state.results.length) {
            state.count.textContent = 'Ничего не найдено';
            state.list.innerHTML = '<div class="site-search-empty">Попробуйте более короткий запрос или другое написание.</div>';
            return;
        }

        state.count.textContent = `${state.results.length} ${resultWord(state.results.length)}`;
        state.list.innerHTML = state.results.map((entry, index) => `
            <button type="button" class="search-result-item" role="option" aria-selected="false" data-search-index="${index}">
                <span class="search-result-meta">
                    <strong>${highlight(entry.title, tokens)}</strong>
                    <small>${escapeHtml(entry.subject)}</small>
                </span>
                <span class="search-result-snippet">${highlight(snippetFor(entry, tokens), tokens)}</span>
            </button>`).join('');

        state.list.querySelectorAll('[data-search-index]').forEach(button => {
            button.addEventListener('click', () => openResult(Number(button.dataset.searchIndex)));
            button.addEventListener('mouseenter', () => select(Number(button.dataset.searchIndex), false));
        });
    }

    function resultWord(count) {
        const mod100 = count % 100;
        const mod10 = count % 10;
        if (mod100 >= 11 && mod100 <= 14) return 'результатов';
        if (mod10 === 1) return 'результат';
        if (mod10 >= 2 && mod10 <= 4) return 'результата';
        return 'результатов';
    }

    async function run(query) {
        state.query = String(query || '').trim();
        const tokens = tokensFor(state.query);
        if (!tokens.length || state.query.length < 2) {
            state.results = [];
            close();
            return;
        }

        show();
        state.count.textContent = 'Индексируем конспекты…';
        state.list.innerHTML = '<div class="site-search-empty">Первый поиск может занять несколько секунд.</div>';
        const requestQuery = state.query;
        await ensureIndex();
        if (requestQuery !== state.query) return;

        const currentPage = pagePath(location.pathname);
        const ranked = state.index
            .filter(entry => state.scope === 'all' || entry.page === currentPage)
            .map(entry => ({ entry, score: scoreEntry(entry, tokens) }))
            .filter(item => item.score >= 0)
            .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'ru'));
        const seenContexts = new Set();
        state.results = ranked.filter(item => {
            const context = normalize(snippetFor(item.entry, tokens))
                .replace(item.entry.normalizedTitle, '')
                .slice(0, 135);
            const key = `${item.entry.page}:${context}`;
            if (seenContexts.has(key)) return false;
            seenContexts.add(key);
            return true;
        }).slice(0, 36).map(item => item.entry);
        state.selected = -1;
        render(tokens);
    }

    function select(index, scroll) {
        if (!state.results.length) return;
        state.selected = (index + state.results.length) % state.results.length;
        state.list.querySelectorAll('.search-result-item').forEach((item, itemIndex) => {
            const active = itemIndex === state.selected;
            item.classList.toggle('active', active);
            item.setAttribute('aria-selected', String(active));
            if (active && scroll) item.scrollIntoView({ block: 'nearest' });
        });
    }

    function pulseTarget(id) {
        const target = document.getElementById(id);
        if (!target) return;
        target.classList.remove('search-target-pulse');
        void target.offsetWidth;
        target.classList.add('search-target-pulse');
        window.setTimeout(() => target.classList.remove('search-target-pulse'), 1200);
    }

    function openResult(index) {
        const result = state.results[index];
        if (!result) return;
        const currentPage = pagePath(location.pathname);
        close();
        if (result.page !== currentPage) {
            try {
                sessionStorage.setItem('almanion_search_target', JSON.stringify({
                    page: result.page, id: result.id, at: Date.now()
                }));
            } catch (_) {}
            location.href = `${result.page}#${encodeURIComponent(result.id)}`;
            return;
        }

        if (window.experimentalReader?.isActive?.() && window.experimentalReader.goToId(result.id, { source: 'search' })) {
            pulseTarget(result.id);
            closeMobileMenuIfAvailable();
            return;
        }

        const target = document.getElementById(result.id);
        if (!target) return;
        closeMobileMenuIfAvailable();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(history.state, '', `#${encodeURIComponent(result.id)}`);
        pulseTarget(result.id);
    }

    function closeMobileMenuIfAvailable() {
        if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
        else {
            document.querySelector('.sidebar')?.classList.remove('open');
            document.querySelector('.sidebar-overlay')?.classList.remove('active');
        }
    }

    function restoreTarget() {
        let pending = null;
        try { pending = JSON.parse(sessionStorage.getItem('almanion_search_target') || 'null'); } catch (_) {}
        if (!pending || pending.page !== pagePath(location.pathname) || Date.now() - pending.at > 30000) return;
        try { sessionStorage.removeItem('almanion_search_target'); } catch (_) {}
        window.setTimeout(() => pulseTarget(pending.id), 280);
    }

    function init() {
        if (state.initialized || document.body.classList.contains('matcenter-page')) return;
        state.input = document.getElementById('searchInput');
        if (!state.input) return;
        state.initialized = true;
        createPanel();
        state.input.setAttribute('autocomplete', 'off');
        state.input.setAttribute('aria-autocomplete', 'list');
        state.input.setAttribute('aria-controls', 'searchResultsPanel');
        state.input.setAttribute('aria-expanded', 'false');

        state.input.addEventListener('input', () => {
            window.clearTimeout(state.debounce);
            state.debounce = window.setTimeout(() => run(state.input.value), 150);
        });
        state.input.addEventListener('focus', () => {
            if (state.input.value.trim().length >= 2) run(state.input.value);
        });
        state.input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (!state.results.length) return;
                event.preventDefault();
                select(state.selected + (event.key === 'ArrowDown' ? 1 : -1), true);
            } else if (event.key === 'Enter' && state.results.length) {
                event.preventDefault();
                openResult(state.selected < 0 ? 0 : state.selected);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                state.input.value = '';
                state.query = '';
                close();
                state.input.blur();
            }
        });
        document.addEventListener('click', event => {
            if (state.panel?.classList.contains('hidden')) return;
            if (event.target.closest('.search-box, .site-search-panel')) return;
            close();
        });
        restoreTarget();
    }

    window.AlmanionSearch = { init };
})();
