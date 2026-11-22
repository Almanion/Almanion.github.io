// Поиск по конспектам Almanion: один результат на тему, с ранжированием
// по заголовкам и возможностью перейти на другую страницу.
(function () {
    'use strict';

    const { plainText } = window.AlmanionSearchText;
    const FALLBACK_INDEX_VERSION = '2026-10-02';
    const CACHE_KEY = 'almanion_search_prebuilt_v4';
    const PAGES = [
        { path: 'physics.html', label: 'Физика' },
        { path: 'chemistry.html', label: 'Химия' },
        { path: 'math.html', label: 'Алгебра' },
        { path: 'geometry.html', label: 'Геометрия' },
        { path: 'geometry-formulas.html', label: 'Формулы по геометрии' },
        { path: 'likbez.html', label: 'Ликбезы' },
        { path: 'physics-exam.html', label: 'Билеты по физике' },
        { path: 'physics-10.html', label: 'Физика · 10 класс' },
        { path: 'chemistry-10.html', label: 'Химия · 10 класс' },
        { path: 'literature-10.html', label: 'Литература · 10 класс' },
        { path: 'russian-ege.html', label: 'Русский язык ЕГЭ' }
    ];
    const state = {
        input: null,
        panel: null,
        list: null,
        count: null,
        scope: 'page',
        request: 0,
        index: [],
        indexPromise: null,
        results: [],
        matches: [],
        selected: -1,
        query: '',
        debounce: 0,
        initialized: false
    };
    let localCache = new WeakMap();
    const home = document.body.classList.contains('home-page');
    const currentPath = pagePath(location.href);

    function normalize(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLocaleLowerCase('ru-RU')
            .replace(/ё/g, 'е')
            .replace(/[‐‑‒–—−]/g, '-')
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
        clone.querySelectorAll('.katex, mjx-container').forEach(math => {
            const tex = math.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
            if (tex) math.replaceWith(document.createTextNode(tex));
        });
        clone.querySelectorAll([
            'script', 'style', '.bookmark-btn', '.copy-block-btn', '.formula-copy-btn',
            'button', '[data-print-exclude]', '.toggle-derivation', '.toggle-proof', '.katex-html', '.MathJax_Preview'
        ].join(',')).forEach(item => item.remove());
        clone.querySelectorAll('p, div, li, h1, h2, h3, h4, td, th, br, figcaption, summary').forEach(block => {
            block.before(' ');
            block.after(' ');
        });
        return plainText(clone.textContent);
    }

    function entriesFromDocument(doc, page) {
        let nodes = Array.from(doc.querySelectorAll('.topic[id], .accent-word-card[id]'))
            .filter(node => !node.matches('.topic') || !node.querySelector('.accent-word-card'));
        if (!nodes.length) nodes = doc.matches?.('.content-section[id]') ? [doc] : Array.from(doc.querySelectorAll('.content-section[id]'));

        return nodes.map((node, order) => {
            const heading = node.matches('.accent-word-card')
                ? node.querySelector('.accent-word')
                : node.querySelector('.topic-title, .part-title, h1, h2, h3');
            const title = plainText(heading?.textContent) || `Раздел ${order + 1}`;
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
            if (Array.isArray(parsed)) return parsed;
            return parsed && Array.isArray(parsed.entries) ? parsed.entries : null;
        } catch (_) {
            return null;
        }
    }

    function writeCache(entries, version) {
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                schemaVersion: 1,
                version: String(version || FALLBACK_INDEX_VERSION),
                entries
            }));
        } catch (_) {}
    }

    function normalizeIndexEntry(entry) {
        const title = plainText(entry?.title);
        const text = plainText(entry?.text);
        return {
            page: pagePath(entry?.page),
            subject: String(entry?.subject || ''),
            id: String(entry?.id || ''),
            title,
            text,
            normalizedTitle: normalize(title),
            normalizedText: normalize(text)
        };
    }

    async function loadBuiltIndex() {
        const url = location.protocol === 'file:' ? 'https://almanion.github.io/search-index.json' : new URL('search-index.json', location.href);
        const response = await fetch(url, {
            credentials: 'omit'
        });
        if (!response.ok) throw new Error(`Search index HTTP ${response.status}`);
        const document = await response.json();
        if (document?.schemaVersion !== 1 || !Array.isArray(document.entries)) {
            throw new Error('Unsupported search index');
        }
        const entries = document.entries.map(normalizeIndexEntry)
            .filter(entry => entry.page && entry.id && entry.title && entry.text);
        if (!entries.length) throw new Error('Search index is empty');
        const cache = () => writeCache(document.entries, document.version);
        if (window.requestIdleCallback) window.requestIdleCallback(cache);
        else setTimeout(cache, 0);
        return entries;
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

        state.indexPromise = loadBuiltIndex()
            .catch(async () => {
                const cached = readCache();
                if (cached?.length) return cached.map(normalizeIndexEntry);
                if (location.protocol === 'file:') return [];
                const results = await Promise.allSettled(PAGES.map(loadPage));
                const entries = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
                if (entries.length && results.every(result => result.status === 'fulfilled')) writeCache(entries, FALLBACK_INDEX_VERSION);
                return entries;
            })
            .then(entries => {
                state.index = entries;
                return state.index;
            })
            .finally(() => {
                state.indexPromise = null;
            });
        return state.indexPromise;
    }

    function currentSection() {
        const reading = document.querySelector('.content-section.exp-reader-section-current');
        if (reading) return reading;
        const sections = Array.from(document.querySelectorAll('.main-content .content-section:not(.notes-empty-state)'));
        return sections.find(section => section.getBoundingClientRect().bottom > innerHeight * 0.25) || sections.at(-1);
    }

    function createPanel() {
        const existing = document.getElementById('searchResultsPanel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'searchResultsPanel';
        panel.className = 'search-results-panel hidden site-search-panel';
        panel.setAttribute('role', 'region');
        panel.setAttribute('aria-label', 'Результаты поиска');
        const section = currentSection();
        state.scope = home ? 'all' : (section ? 'section' : 'page');
        const scopes = [];
        if (section) scopes.push(['section', 'Этот раздел']);
        if (!home && (!section || document.querySelectorAll('.main-content .content-section:not(.notes-empty-state)').length > 1)) scopes.push(['page', 'Эта страница']);
        scopes.push(['all', 'Весь сайт']);
        panel.innerHTML = `
            <div class="search-results-head">
                <strong class="site-search-count">Поиск по конспектам</strong>
                <button type="button" class="search-results-close" aria-label="Закрыть">×</button>
            </div>
            <div class="site-search-scope" role="group" aria-label="Область поиска">
                ${scopes.map(([id, label]) => `<button type="button" class="${id === state.scope ? 'active' : ''}" data-search-scope="${id}" aria-pressed="${id === state.scope}">${label}</button>`).join('')}
            </div>
            <div class="search-results-list" id="siteSearchOptions" role="listbox" aria-label="Найденные темы"></div>
            <button type="button" class="search-results-more" hidden>Показать ещё</button>`;

        const box = state.input.closest('.search-box');
        (box?.parentElement || state.input.parentElement).insertBefore(panel, box?.nextSibling || state.input.nextSibling);
        state.panel = panel;
        state.list = panel.querySelector('.search-results-list');
        state.count = panel.querySelector('.site-search-count');
        state.more = panel.querySelector('.search-results-more');
        state.more.addEventListener('click', () => {
            const firstNew = state.results.length;
            state.results = state.matches.slice(0, firstNew + 36);
            render(tokensFor(state.query));
            state.input.focus({ preventScroll: true });
            select(firstNew, true);
        });

        panel.querySelector('.search-results-close').addEventListener('click', close);
        panel.querySelectorAll('[data-search-scope]').forEach(button => {
            button.addEventListener('click', () => {
                state.scope = button.dataset.searchScope;
                panel.querySelectorAll('[data-search-scope]').forEach(item => {
                    const active = item === button;
                    item.classList.toggle('active', active);
                    item.setAttribute('aria-pressed', String(active));
                });
                run(state.input.value);
            });
        });
    }

    function show() {
        state.panel?.classList.remove('hidden');
        state.input?.setAttribute('aria-expanded', 'true');
    }

    function close() {
        state.request++;
        clearTimeout(state.debounce);
        state.panel?.classList.add('hidden');
        state.input?.setAttribute('aria-expanded', 'false');
        state.input?.removeAttribute('aria-activedescendant');
        state.results = [];
        state.matches = [];
        state.selected = -1;
    }

    function tokensFor(query) {
        return normalize(plainText(query)).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    }

    function scoreEntry(entry, tokens) {
        if (!tokens.every(token => entry.normalizedText.includes(token))) return -1;
        let score = currentPath === entry.page ? 4 : 0;
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
        const beginsWithTitle = entry.normalizedText.startsWith(entry.normalizedTitle);
        const body = beginsWithTitle ? entry.text.slice(entry.title.length).trimStart() : entry.text;
        const lower = beginsWithTitle ? entry.normalizedText.slice(entry.normalizedTitle.length).trimStart() : entry.normalizedText;
        let position = lower.indexOf(tokens.join(' '));
        if (position < 0) tokens.forEach(token => {
            const found = lower.indexOf(token);
            if (found >= 0 && (position < 0 || found < position)) position = found;
        });
        if (position < 0) position = 0;
        const start = Math.max(0, position - 72);
        const end = Math.min(body.length, position + 170);
        return `${start ? '…' : ''}${body.slice(start, end).trim()}${end < body.length ? '…' : ''}`;
    }

    function escapeHtml(value) {
        return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function tokenPattern(token) {
        return [...token].map(ch => {
                if (ch === 'е') return '[её]';
                if (/\d/.test(ch)) return '[' + ch + '₀₁₂₃₄₅₆₇₈₉'[ch] + '⁰¹²³⁴⁵⁶⁷⁸⁹'[ch] + ']';
                return ch;
        }).join('');
    }
    function highlight(value, tokens) {
        const pattern = tokens.slice().sort((a, b) => b.length - a.length).map(tokenPattern).join('|');
        if (!pattern) return escapeHtml(value);
        return value.split(new RegExp(`(${pattern})`, 'giu')).map((part, index) =>
            index % 2 ? '<mark class="search-result-term">' + escapeHtml(part) + '</mark>' : escapeHtml(part)).join('');
    }

    function render(tokens) {
        state.more.hidden = state.matches.length <= state.results.length;
        if (!state.results.length) {
            state.count.textContent = 'Ничего не найдено';
            state.list.innerHTML = '<div class="site-search-empty">Попробуйте более короткий запрос или другое написание.</div>';
            return;
        }

        const total = state.matches.length;
        state.count.textContent = total > state.results.length
            ? `Первые ${state.results.length} из ${total}` : `${total} ${resultWord(total)}`;
        state.list.innerHTML = state.results.map((entry, index) => `
            <a href="${escapeHtml(resultUrl(entry))}" class="search-result-item" role="option" tabindex="-1" id="siteSearchOption${index}" aria-selected="false" data-search-index="${index}">
                <span class="search-result-meta">
                    <strong>${highlight(entry.title, tokens)}</strong>
                    <small>${escapeHtml(entry.subject)}</small>
                </span>
                <span class="search-result-snippet">${highlight(snippetFor(entry, tokens), tokens)}</span>
            </a>`).join('');

        state.list.querySelectorAll('[data-search-index]').forEach(button => {
            const result = state.results[Number(button.dataset.searchIndex)];
            button.addEventListener('click', event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                openResult(result);
            });
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
        const request = ++state.request;
        let entries;
        if (state.scope === 'all') {
            if (!state.index.length) {
                state.more.hidden = true;
                state.count.textContent = 'Загружаем поиск…';
                state.list.replaceChildren();
            }
            entries = await ensureIndex();
            if (request !== state.request) return;
            if (!entries.length) {
                state.count.textContent = 'Поиск по сайту недоступен';
                state.list.innerHTML = '<button type="button" class="search-result-item">Повторить поиск</button>';
                state.list.firstElementChild.onclick = () => run(state.query);
                return;
            }
        } else {
            const root = state.scope === 'section' ? currentSection() || document : document;
            if (!localCache.has(root)) localCache.set(root, entriesFromDocument(root, { path: pagePath(location.pathname), label: document.querySelector('.page-header h1')?.textContent || document.title }));
            entries = localCache.get(root);
        }
        const ranked = entries
            .map(entry => ({ entry, score: scoreEntry(entry, tokens) }))
            .filter(item => item.score >= 0)
            .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title, 'ru'));
        const seenContexts = new Set();
        const distinct = ranked.filter(item => {
            const context = normalize(snippetFor(item.entry, tokens))
                .replace(item.entry.normalizedTitle, '')
                .slice(0, 135);
            const key = `${item.entry.page}:${item.entry.normalizedTitle}:${context}`;
            if (seenContexts.has(key)) return false;
            seenContexts.add(key);
            return true;
        });
        state.matches = distinct.map(item => item.entry);
        state.results = state.matches.slice(0, 36);
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
            if (active) state.input.setAttribute('aria-activedescendant', item.id);
            if (active && scroll) item.scrollIntoView({ block: 'nearest' });
        });
    }

    function resultUrl(entry) {
        const url = new URL(entry.page, location.href);
        url.searchParams.set('find', state.query);
        url.hash = entry.id;
        return url.href;
    }

    // Keep ranges in the original DOM so emphasis, formulas and buttons retain their behavior.
    function findPassage(root, query) {
        const tokens = tokensFor(query).map(tokenPattern);
        if (!tokens.length) return null;
        const phrase = new RegExp(tokens.join('[\\s\\p{P}]+'), 'iu');
        const terms = tokens.map(token => new RegExp(token, 'iu'));
        const groups = new Map();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, node => {
            if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
            if (node.matches('button,script,style,svg,template,.katex-html,.note-filter-empty,[data-print-exclude]')) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_SKIP;
        });
        for (let node; (node = walker.nextNode());) {
            const math = node.parentElement.closest('.katex');
            if (math && !node.parentElement.closest('annotation')) continue;
            const el = node.parentElement.closest('p,li,td,th,h2,h3,h4,h5,figcaption,summary,div,section,article');
            if (!el || !root.contains(el)) continue;
            if (!groups.has(el)) groups.set(el, { text: '', runs: [] });
            const group = groups.get(el);
            group.runs.push({ node, math, start: group.text.length });
            group.text += math ? plainText(node.data) : node.data;
        }
        let best = null, bestScore = 0;
        for (const group of groups.values()) {
            const full = phrase.exec(group.text);
            const matches = full ? [full] : terms.map(term => term.exec(group.text)).filter(Boolean);
            const score = full ? terms.length + 1 : matches.length;
            if (score <= bestScore) continue;
            const match = matches[0], end = match.index + match[0].length;
            const first = group.runs.findLast(run => run.start <= match.index);
            const last = group.runs.findLast(run => run.start < end);
            const range = document.createRange();
            if (first.math) range.setStartBefore(first.math);
            else range.setStart(first.node, match.index - first.start);
            if (last.math) range.setEndAfter(last.math);
            else range.setEnd(last.node, end - last.start);
            best = { range, el: first.math || first.node.parentElement };
            bestScore = score;
            if (full) break;
        }
        return best;
    }

    let releaseHighlight = () => {};
    function landOn(id, query, incoming = false) {
        const root = document.getElementById(id);
        if (!root) return;
        const options = { source: 'search', scroll: false, updateHash: !incoming, find: query };
        if (!window.experimentalReader?.goToId(id, options) && !incoming) {
            const url = new URL(location.href);
            url.hash = id;
            if (location.protocol !== 'file:') url.searchParams.set('find', query);
            if (url.href !== location.href) history.pushState(null, '', url);
        }
        releaseHighlight();
        const match = findPassage(root, query);
        const target = match?.el || root;
        for (let el = target; el; el = el.parentElement) if (el.matches('details')) el.open = true;
        window.AlmanionNoteFilter?.revealMatch(target);
        const block = target.closest('p,li,td,th,[data-note-block],.accent-word-card,h3,h4') || target;
        const highlights = window.CSS?.highlights;
        if (match && highlights) highlights.set('note-search-match', new Highlight(match.range));
        block.classList.add('search-target-pulse');
        let frame = 0;
        function align() {
            frame = 0;
            if (!target.getClientRects().length) return;
            const controls = document.querySelector('.note-reader-controls');
            const offset = (controls?.offsetHeight || 0) + (parseFloat(controls && getComputedStyle(controls).top) || 0) + 20;
            const rect = match?.range.getClientRects()[0] || target.getBoundingClientRect();
            if (Math.abs(rect.top - offset) > 2) window.scrollTo({ top: scrollY + rect.top - offset, behavior: 'instant' });
        }
        // Images and rendered formulas above a deep match can change the topic height after landing.
        function schedule() { if (!frame) frame = requestAnimationFrame(align); }
        const observer = new ResizeObserver(schedule);
        observer.observe(root);
        const stop = new AbortController();
        const timer = setTimeout(clear, 3000);
        function clear() {
            clearTimeout(timer);
            stop.abort();
            observer.disconnect();
            cancelAnimationFrame(frame);
            block.classList.remove('search-target-pulse');
            highlights?.delete('note-search-match');
        }
        for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'popstate', 'almanion:topic-visible']) {
            window.addEventListener(event, clear, { capture: true, passive: true, signal: stop.signal });
        }
        document.fonts?.ready.then(() => { if (!stop.signal.aborted) schedule(); });
        releaseHighlight = clear;
        schedule();
    }

    function openResult(result) {
        if (!result) return;
        const currentPage = pagePath(location.pathname);
        close();
        if (result.page !== currentPage) {
            location.href = resultUrl(result);
            return;
        }

        closeMobileMenuIfAvailable();
        landOn(result.id, state.query);
    }

    function closeMobileMenuIfAvailable() {
        if (typeof usesTabletDrawer === 'function' && usesTabletDrawer()) collapseSidebar();
        else if (typeof window.closeMobileMenu === 'function') window.closeMobileMenu();
        else {
            document.querySelector('.sidebar')?.classList.remove('open');
            document.querySelector('.sidebar-overlay')?.classList.remove('active');
        }
    }

    function restoreTarget() {
        const url = new URL(location.href);
        const query = url.searchParams.get('find');
        if (query && url.hash) landOn(decodeURIComponent(url.hash.slice(1)), query, true);
    }

    function init() {
        if (state.initialized || document.body.classList.contains('matcenter-page')) return;
        state.input = document.getElementById('searchInput');
        if (!state.input) return;
        state.initialized = true;
        createPanel();
        state.input.setAttribute('autocomplete', 'off');
        state.input.setAttribute('role', 'combobox');
        state.input.setAttribute('aria-autocomplete', 'list');
        state.input.setAttribute('aria-controls', 'siteSearchOptions');
        state.input.setAttribute('aria-expanded', 'false');

        state.input.addEventListener('input', () => {
            state.request++;
            state.results = [];
            state.more.hidden = true;
            state.input.removeAttribute('aria-activedescendant');
            window.clearTimeout(state.debounce);
            state.debounce = window.setTimeout(() => run(state.input.value), 80);
        });
        state.input.addEventListener('focus', () => {
            if (state.input.value.trim().length >= 2 && state.panel.classList.contains('hidden')) run(state.input.value);
        });
        state.input.addEventListener('keydown', event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                if (!state.results.length) return;
                event.preventDefault();
                select(state.selected + (event.key === 'ArrowDown' ? 1 : -1), true);
            } else if (event.key === 'Enter' && state.results.length) {
                event.preventDefault();
                openResult(state.results[Math.max(0, state.selected)]);
            } else if (event.key === 'Escape' && !home) {
                event.preventDefault();
                state.input.value = '';
                state.query = '';
                close();
                state.input.focus();
            }
        });
        if (!home) document.addEventListener('click', event => {
            if (state.panel?.classList.contains('hidden')) return;
            if (event.target.closest('.search-box, .site-search-panel')) return;
            close();
        });
        const main = document.querySelector('.main-content');
        if (main) new MutationObserver(() => { localCache = new WeakMap(); })
            .observe(main, { childList: true, characterData: true, subtree: true });
        const dialog = document.getElementById('homeSearchDialog');
        dialog?.addEventListener('close', () => { if (!dialog.open) close(); });
        restoreTarget();
        // The first input event may precede this intent-loaded script.
        if (state.input.value.trim().length >= 2) run(state.input.value);
    }

    window.AlmanionSearch = { init };
})();
